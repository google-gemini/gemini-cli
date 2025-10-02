package com.google.gemini.cli

import DiffManager
import com.google.gemini.cli.transport.StreamableHttpServerTransport
import com.intellij.openapi.components.service
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFileManager
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sse.*
import io.modelcontextprotocol.kotlin.sdk.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.Implementation
import io.modelcontextprotocol.kotlin.sdk.JSONRPCNotification
import io.modelcontextprotocol.kotlin.sdk.ServerCapabilities
import io.modelcontextprotocol.kotlin.sdk.TextContent
import io.modelcontextprotocol.kotlin.sdk.Tool
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.ServerOptions
import io.modelcontextprotocol.kotlin.sdk.shared.McpJson
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import java.io.File
import java.security.SecureRandom
import java.util.*
import java.util.concurrent.TimeUnit

@Serializable
private data class IdeInfo(val name: String, val displayName: String)

@Serializable
private data class PortInfo(
  val port: Int,
  val authToken: String,
  val ppid: Long,
  val ideInfo: IdeInfo,
  val workspacePath: String
)

class IdeServer(private val project: Project, private val diffManager: DiffManager) {
  private var server: Any? = null
  private var portFile: File? = null
  private val authToken = generateAuthToken()
  private val openFilesManager: OpenFilesManager = project.service()
  private val transports = mutableMapOf<String, StreamableHttpServerTransport>()
  private val sessionsWithInitialNotification = mutableSetOf<String>()
  private val keepAliveJobs = mutableMapOf<String, Job>()
  private val mcpServer = createMcpServer()
  private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  companion object {
    private val LOG = Logger.getInstance(IdeServer::class.java)
    private const val KEEP_ALIVE_INTERVAL_MS = 30000L // 30 seconds
  }

  init {
    val busConnection = project.messageBus.connect()
    busConnection.subscribe(OpenFilesManager.IDE_CONTEXT_TOPIC, object : IdeContextListener {
      override fun onIdeContextUpdate() {
        broadcastIdeContextUpdate()
      }
    })
    busConnection.subscribe(DiffManager.DIFF_MANAGER_TOPIC, object : DiffManager.DiffManagerListener {
      override fun onDiffNotification(notification: JSONRPCNotification) {
        broadcastNotification(notification)
      }
    })

    // Listen for workspace folder changes (equivalent to VS Code's onDidChangeWorkspaceFolders)
    busConnection.subscribe(VirtualFileManager.VFS_CHANGES, object : com.intellij.openapi.vfs.newvfs.BulkFileListener {
      override fun after(events: List<com.intellij.openapi.vfs.newvfs.events.VFileEvent>) {
        // Check if any of the events represent workspace root changes
        val hasWorkspaceChange = events.any { event ->
          event is com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent ||
          event is com.intellij.openapi.vfs.newvfs.events.VFileDeleteEvent ||
          event is com.intellij.openapi.vfs.newvfs.events.VFileMoveEvent
        }

        if (hasWorkspaceChange) {
          LOG.info("Workspace change detected, syncing environment variables")
          syncEnvVars()
        }
      }
    })

    // Listen for project trust changes (equivalent to VS Code's onDidGrantWorkspaceTrust)
    // In JetBrains, we can listen for project state changes
    busConnection.subscribe(com.intellij.openapi.project.ProjectManager.TOPIC, object : com.intellij.openapi.project.ProjectManagerListener {
      override fun projectOpened(project: Project) {
        LOG.info("Project opened, syncing environment variables")
        syncEnvVars()
      }

      override fun projectClosingBeforeSave(project: Project) {
        // Clean up when project closes
        if (project == this@IdeServer.project) {
          LOG.info("Project closing, cleaning up environment variables")
          coroutineScope.launch {
            stop()
          }
        }
      }
    })
  }

  suspend fun start() {
    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        server = embeddedServer(Netty, port = 0, host = "127.0.0.1") {
          install(SSE)
          install(ContentNegotiation) {
            json(McpJson)
          }
          routing {
            intercept(ApplicationCallPipeline.Call) {
              if (!call.request.path().startsWith("/mcp")) return@intercept

              val authHeader = call.request.headers[HttpHeaders.Authorization]
              if (authHeader != "Bearer $authToken") {
                call.respond(HttpStatusCode.Unauthorized, "Unauthorized")
                finish()
              }
            }

            post("/mcp") {
              handleMcpPostRequest(call)
            }
            sse("/mcp") {
              handleMcpGetRequest(this, call)
            }
            delete("/mcp") {
              handleMcpDeleteRequest(call)
            }
          }
        }.start(wait = false)

        val startedServer = server as EmbeddedServer<*, *>
        val port = runBlocking { startedServer.engine.resolvedConnectors().first().port }
        LOG.info("MCP IDE Server V2 started on port ${port}")
        writePortInfo(port)

      } catch (e: Exception) {
        LOG.error("Failed to start MCP IDE Server V2", e)
      }
    }
  }

  private fun createMcpServer(): Server {
    val server = Server(
      Implementation(
        name = "gemini-cli-companion-mcp-server",
        version = "1.0.0"
      ),
      ServerOptions(
        capabilities = ServerCapabilities(
          tools = ServerCapabilities.Tools(listChanged = true)
        )
      )
    )

    server.addTool(
      name = "openDiff",
      description = "(IDE Tool) Open a diff view to create or modify a file. Returns a notification once the diff has been accepted or rejected.",
      inputSchema = Tool.Input(
        properties = buildJsonObject {
          put("filePath", buildJsonObject { put("type", "string") })
          put("newContent", buildJsonObject { put("type", "string") })
        },
        required = listOf("filePath", "newContent")
      )
    ) { request ->
      val filePath = request.arguments["filePath"]?.toString()?.removeSurrounding("\"") ?: throw IllegalArgumentException("filePath is required")
      val newContent = request.arguments["newContent"]?.toString()?.removeSurrounding("\"") ?: throw IllegalArgumentException("newContent is required")

      ApplicationManager.getApplication().invokeLater {
        diffManager.showDiff(filePath, newContent)
      }

      CallToolResult(content = emptyList())
    }

    server.addTool(
      name = "closeDiff",
      description = "(IDE Tool) Close an open diff view for a specific file.",
      inputSchema = Tool.Input(
        properties = buildJsonObject {
          put("filePath", buildJsonObject { put("type", "string") })
          put("suppressNotification", buildJsonObject { put("type", "boolean") })
        },
        required = listOf("filePath")
      )
    ) { request ->
      val filePath = request.arguments["filePath"]?.toString()?.removeSurrounding("\"") ?: throw IllegalArgumentException("filePath is required")
      val suppressNotification = request.arguments["suppressNotification"]?.toString()?.toBoolean() ?: false

      val finalContent = diffManager.closeDiff(filePath, suppressNotification)

      CallToolResult(
        content = if (finalContent != null) listOf(TextContent(finalContent)) else emptyList()
      )
    }

    return server
  }

  private suspend fun handleMcpPostRequest(call: ApplicationCall) {
    val sessionId = call.request.headers["mcp-session-id"]
    val transport = if (sessionId != null && transports.containsKey(sessionId)) {
      transports[sessionId]!!
    } else {
      // Create new transport for initialization request
      val newTransport = StreamableHttpServerTransport(
        true,
        allowedHosts = listOf("localhost", "127.0.0.1", "host.docker.internal")
      )

      newTransport.setSessionIdGenerator { UUID.randomUUID().toString() }
      newTransport.setOnSessionInitialized { newSessionId ->
        LOG.info("New MCP session initialized: $newSessionId")
        transports[newSessionId] = newTransport
        startKeepAliveForSession(newSessionId, newTransport)

        // Send initial IDE context to new session
        LOG.info("IdeServer: Sending initial IDE context to new session: $newSessionId")
        sendInitialIdeContextToSession(newSessionId, newTransport)
      }
      newTransport.setOnSessionClosed { closedSessionId ->
        LOG.info("MCP session closed: $closedSessionId")
        cleanupSession(closedSessionId)
      }

      mcpServer.connect(newTransport)
      newTransport
    }

    transport.handlePostRequest(null, call)
  }

  private suspend fun handleMcpGetRequest(session: ServerSSESession, call: ApplicationCall) {
    val sessionId = call.request.headers["mcp-session-id"]
    if (sessionId == null || !transports.containsKey(sessionId)) {
      call.respond(HttpStatusCode.BadRequest, "Invalid or missing session ID")
      return
    }

    val transport = transports[sessionId]!!
    transport.handleGetRequest(session, call)
  }

  private suspend fun handleMcpDeleteRequest(call: ApplicationCall) {
    val sessionId = call.request.headers["mcp-session-id"]
    if (sessionId == null || !transports.containsKey(sessionId)) {
      call.respond(HttpStatusCode.BadRequest, "Invalid or missing session ID")
      return
    }

    val transport = transports[sessionId]!!
    transport.handleDeleteRequest(null, call)
  }

  private fun writePortInfo(port: Int) {
    syncEnvVars(port)
  }

  private fun syncEnvVars(port: Int? = null) {
    val appInfo = ApplicationInfo.getInstance()
    val ideInfo = IdeInfo(
      name = appInfo.versionName.lowercase().replace(" ", ""),
      displayName = appInfo.fullApplicationName
    )

    val workspacePath = ProjectRootManager.getInstance(project).contentRoots.joinToString(File.pathSeparator) { it.path }

    val ppid = ProcessHandle.current().pid()
    val actualPort = port ?: project.service<GeminiCliServerState>().port

    if (actualPort == null) {
      LOG.warn("Cannot sync env vars: port is null")
      return
    }

    val portInfo = PortInfo(
      port = actualPort,
      authToken = authToken,
      ppid = ppid,
      ideInfo = ideInfo,
      workspacePath = workspacePath
    )
    val portInfoJson = McpJson.encodeToString(portInfo)

    val ideDir = File(System.getProperty("java.io.tmpdir"), "gemini/ide").apply { mkdirs() }
    portFile = File(ideDir, "gemini-ide-server-$ppid-$actualPort.json").apply {
      writeText(portInfoJson)
      setReadable(true, true)
      setWritable(true, true)
      deleteOnExit()
    }
    LOG.info("Wrote port info to ${portFile?.absolutePath}")

    project.service<GeminiCliServerState>().apply {
      this.port = actualPort
      this.workspacePath = workspacePath
    }

    // Broadcast IDE context update after syncing env vars
    broadcastIdeContextUpdate()
  }

  private fun startKeepAliveForSession(sessionId: String, transport: StreamableHttpServerTransport) {
    val keepAliveJob = coroutineScope.launch {
      while (isActive && transports.containsKey(sessionId)) {
        try {
          delay(KEEP_ALIVE_INTERVAL_MS)
          // Send ping message to keep connection alive
          transport.send(JSONRPCNotification(
            jsonrpc = "2.0",
            method = "ping"
          ))
        } catch (e: Exception) {
          LOG.warn("Failed to send keep-alive ping for session $sessionId: ${e.message}")
          // If we can't send ping, assume the session is dead and clean up
          cleanupSession(sessionId)
          break
        }
      }
    }
    keepAliveJobs[sessionId] = keepAliveJob
  }

  private fun sendInitialIdeContextToSession(sessionId: String, transport: StreamableHttpServerTransport) {
    if (sessionsWithInitialNotification.contains(sessionId)) {
      return
    }

    val context = openFilesManager.getState()
    val contextJson = McpJson.encodeToJsonElement(context)
    val notification = JSONRPCNotification(
      method = "ide/contextUpdate",
      params = contextJson
    )

    coroutineScope.launch {
      try {
        transport.send(notification)
        sessionsWithInitialNotification.add(sessionId)
        LOG.debug("Initial IDE context sent to session: $sessionId")
      } catch (e: Exception) {
        LOG.warn("Failed to send initial IDE context to session $sessionId: ${e.message}")
      }
    }
  }

  private fun cleanupSession(sessionId: String) {
    LOG.info("Cleaning up session: $sessionId")

    // Cancel keep-alive job
    keepAliveJobs[sessionId]?.cancel()
    keepAliveJobs.remove(sessionId)

    // Remove from sessions with initial notification
    sessionsWithInitialNotification.remove(sessionId)

    // Remove transport
    transports.remove(sessionId)
  }

  suspend fun stop() {
    // Clean up all sessions
    transports.keys.toList().forEach { sessionId ->
      cleanupSession(sessionId)
    }

    // Cancel coroutine scope
    coroutineScope.cancel()

    if (server != null) {
      val startedServer = server as EmbeddedServer<*, *>
      startedServer.stop(0, 0, TimeUnit.MILLISECONDS)
    }
    portFile?.delete()

    project.service<GeminiCliServerState>().apply {
      this.port = null
      this.workspacePath = null
    }
  }

  private fun generateAuthToken(): String {
    val random = SecureRandom()
    val bytes = ByteArray(32)
    random.nextBytes(bytes)
    return Base64.getEncoder().encodeToString(bytes)
  }

  private fun broadcastIdeContextUpdate() {
    val context = openFilesManager.getState()
    val contextJson = McpJson.encodeToJsonElement(context)
    val notification = JSONRPCNotification(
      method = "ide/contextUpdate",
      params = contextJson
    )
    LOG.info("IdeServer: Broadcasting IDE context update, open files: ${context.workspaceState?.openFiles?.size ?: 0}, active sessions: ${transports.size}")
    broadcastNotification(notification)
  }

  private fun broadcastNotification(notification: JSONRPCNotification) {
    LOG.info("IdeServer: Broadcasting notification to ${transports.size} sessions: ${notification.method}")
    transports.forEach { (sessionId, transport) ->
      coroutineScope.launch {
        try {
          transport.send(notification)
          LOG.info("IdeServer: Notification successfully sent to session $sessionId: ${notification.method}")
        } catch (e: Exception) {
          LOG.warn("Failed to send notification to session $sessionId: ${e.message}")
          // If we can't send to a session, clean it up
          cleanupSession(sessionId)
        }
      }
    }
  }
}

