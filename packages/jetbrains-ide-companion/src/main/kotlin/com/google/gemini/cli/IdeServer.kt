package com.google.gemini.cli

import DiffManager
import com.google.gemini.cli.transport.HttpExchangeAdapter
import com.google.gemini.cli.transport.StreamableHttpServerTransport
import com.google.gemini.cli.transport.reject
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFileManager
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import io.modelcontextprotocol.kotlin.sdk.*
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.ServerOptions
import io.modelcontextprotocol.kotlin.sdk.shared.McpJson
import java.io.File
import java.io.IOException
import java.net.InetSocketAddress
import java.security.SecureRandom
import java.util.*
import java.util.concurrent.Executors
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

@Serializable private data class IdeInfo(val name: String, val displayName: String)

@Serializable
private data class PortInfo(
  val port: Int,
  val authToken: String,
  val ppid: Long,
  val ideInfo: IdeInfo,
  val workspacePath: String
)



class IdeServer(private val project: Project, private val diffManager: DiffManager) {
  private var server: HttpServer? = null
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
    busConnection.subscribe(
      OpenFilesManager.IDE_CONTEXT_TOPIC,
      object : IdeContextListener {
        override fun onIdeContextUpdate() {
          broadcastIdeContextUpdate()
        }
      }
    )
    busConnection.subscribe(
      DiffManager.DIFF_MANAGER_TOPIC,
      object : DiffManager.DiffManagerListener {
        override fun onDiffNotification(notification: JSONRPCNotification) {
          broadcastNotification(notification)
        }
      }
    )

    busConnection.subscribe(
      VirtualFileManager.VFS_CHANGES,
      object : com.intellij.openapi.vfs.newvfs.BulkFileListener {
        override fun after(events: List<com.intellij.openapi.vfs.newvfs.events.VFileEvent>) {
          val hasWorkspaceChange =
            events.any { event ->
              event is com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent ||
                event is
                  com.intellij.openapi.vfs.newvfs.events.VFileDeleteEvent ||
                event is com.intellij.openapi.vfs.newvfs.events.VFileMoveEvent
            }
          if (hasWorkspaceChange) {
            LOG.info("Workspace change detected, syncing environment variables")
            syncEnvVars()
          }
        }
      }
    )

    busConnection.subscribe(
      com.intellij.openapi.project.ProjectManager.TOPIC,
      object : com.intellij.openapi.project.ProjectManagerListener {
        override fun projectOpened(project: Project) {
          LOG.info("Project opened, syncing environment variables")
          syncEnvVars()
        }

        override fun projectClosingBeforeSave(project: Project) {
          if (project == this@IdeServer.project) {
            LOG.info("Project closing, cleaning up environment variables")
            coroutineScope.launch { stop() }
          }
        }
      }
    )
  }

  fun start() {
    LOG.info("IdeServer: Starting MCP IDE Server")
    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        val newServer = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        newServer.createContext("/mcp", McpHandler())
        newServer.executor = Executors.newCachedThreadPool()
        newServer.start()
        server = newServer

        val port = newServer.address.port
        LOG.info("MCP IDE Server started on port $port")
        writePortInfo(port)
        LOG.info("IdeServer: Server startup completed, port info written")
      } catch (e: Exception) {
        LOG.error("Failed to start MCP IDE Server", e)
      }
    }
  }

  private inner class McpHandler : HttpHandler {
    override fun handle(exchange: HttpExchange) {
      coroutineScope.launch {
        try {
          if (!exchange.requestURI.path.startsWith("/mcp")) {
            sendResponse(exchange, 404, "Not Found")
            return@launch
          }

          val authHeader = exchange.requestHeaders.getFirst("Authorization")
          if (authHeader != "Bearer $authToken") {
            sendResponse(exchange, 401, "Unauthorized")
            return@launch
          }

          val adapter = HttpExchangeAdapter(exchange)
          when (exchange.requestMethod.uppercase()) {
            "POST" -> handleMcpPostRequest(adapter)
            "GET" -> handleMcpGetRequest(adapter)
            "DELETE" -> handleMcpDeleteRequest(adapter)
            else -> {
              exchange.responseHeaders.add("Allow", "GET, POST, DELETE")
              sendResponse(exchange, 405, "Method Not Allowed")
            }
          }
        } catch (e: Exception) {
          LOG.error("Error handling MCP request", e)
          try {
            sendResponse(exchange, 500, "Internal Server Error")
          } catch (ioe: IOException) {
            LOG.error("Failed to send error response", ioe)
          }
        }
      }
    }

    private fun sendResponse(exchange: HttpExchange, code: Int, body: String) {
      try {
        exchange.sendResponseHeaders(code, body.length.toLong())
        exchange.responseBody.use { it.write(body.toByteArray()) }
      } finally {
        exchange.close()
      }
    }


  }

  private fun createMcpServer(): Server {
    val server =
      Server(
        Implementation(name = "gemini-cli-companion-mcp-server", version = "1.0.0"),
        ServerOptions(
          capabilities =
            ServerCapabilities(
              tools = ServerCapabilities.Tools(listChanged = true)
            )
        )
      )

    server.addTool(
      name = "openDiff",
      description =
        "(IDE Tool) Open a diff view to create or modify a file. Returns a notification once the diff has been accepted or rejected.",
      inputSchema =
        Tool.Input(
          properties =
            buildJsonObject {
              put("filePath", buildJsonObject { put("type", "string") })
              put("newContent", buildJsonObject { put("type", "string") })
            },
          required = listOf("filePath", "newContent")
        )
    ) { request ->
      val filePath = (request.arguments["filePath"] as? JsonPrimitive)?.content
        ?: throw IllegalArgumentException("filePath is required and must be a string")
      val newContent = (request.arguments["newContent"] as? JsonPrimitive)?.content
        ?: throw IllegalArgumentException("newContent is required and must be a string")

      ApplicationManager.getApplication().invokeLater { diffManager.showDiff(filePath, newContent) }

      CallToolResult(content = emptyList())
    }

    server.addTool(
      name = "closeDiff",
      description = "(IDE Tool) Close an open diff view for a specific file.",
      inputSchema =
        Tool.Input(
          properties =
            buildJsonObject {
              put("filePath", buildJsonObject { put("type", "string") })
              put(
                "suppressNotification",
                buildJsonObject { put("type", "boolean") }
              )
            },
          required = listOf("filePath")
        )
    ) { request ->
      val filePath = (request.arguments["filePath"] as? JsonPrimitive)?.content
        ?: throw IllegalArgumentException("filePath is required and must be a string")
      val suppressNotification = (request.arguments["suppressNotification"] as? JsonPrimitive)?.booleanOrNull ?: false
      val content = diffManager.closeDiff(filePath, suppressNotification)

      @Serializable data class CloseDiffResponse(val content: String?)
      val response = McpJson.encodeToString(CloseDiffResponse(content))

      CallToolResult(
        content = listOf(TextContent(response))
      )
    }

    return server
  }

  private suspend fun handleMcpPostRequest(adapter: HttpExchangeAdapter) {
    val sessionId = adapter.getRequestHeader("mcp-session-id")
    val transport =
      if (sessionId != null && transports.containsKey(sessionId)) {
        transports[sessionId]!!
      } else {
        val newTransport =
          StreamableHttpServerTransport(
            enableJsonResponse = false,
            allowedHosts = listOf("localhost", "127.0.0.1")
          )

        newTransport.setOnSessionInitialized { newSessionId ->
          LOG.info("New MCP session initialized: $newSessionId")
          transports[newSessionId] = newTransport
          startKeepAliveForSession(newSessionId, newTransport)
        }
        newTransport.setOnSessionClosed { closedSessionId ->
          LOG.info("MCP session closed: $closedSessionId")
          cleanupSession(closedSessionId)
        }

        mcpServer.connect(newTransport)
        newTransport
      }

    transport.handlePostRequest(adapter)
  }

  private suspend fun handleMcpGetRequest(adapter: HttpExchangeAdapter) {
    val sessionId = adapter.getRequestHeader("mcp-session-id")
    if (sessionId == null || !transports.containsKey(sessionId)) {
      reject(
        adapter,
        400,
        io.modelcontextprotocol.kotlin.sdk.ErrorCode.Unknown(-32001),
        "Invalid or missing session ID"
      )
      return
    }

    val transport = transports[sessionId]!!
    transport.handleGetRequest(adapter)

    if (!sessionsWithInitialNotification.contains(sessionId)) {
      sendInitialIdeContextToSession(sessionId, transport)
      sessionsWithInitialNotification.add(sessionId)
    }
  }

  private suspend fun handleMcpDeleteRequest(adapter: HttpExchangeAdapter) {
    val sessionId = adapter.getRequestHeader("mcp-session-id")
    if (sessionId == null || !transports.containsKey(sessionId)) {
      reject(
        adapter,
        400,
        io.modelcontextprotocol.kotlin.sdk.ErrorCode.Unknown(-32001),
        "Invalid or missing session ID"
      )
      return
    }

    val transport = transports[sessionId]!!
    transport.handleDeleteRequest(adapter)
  }

  private fun writePortInfo(port: Int) {
    syncEnvVars(port)
  }

  private fun syncEnvVars(port: Int? = null) {
    val appInfo = ApplicationInfo.getInstance()
    val ideInfo =
      IdeInfo(
        name = appInfo.versionName.lowercase(Locale.getDefault()).replace(" ", ""),
        displayName = appInfo.fullApplicationName
      )

    val contentRoots = ProjectRootManager.getInstance(project).contentRoots
    val workspacePath = if (contentRoots.isNotEmpty()) {
        contentRoots.joinToString(File.pathSeparator) { it.path }
    } else {
        project.basePath ?: ""
    }

    val ppid = ProcessHandle.current().pid()
    val actualPort = port ?: project.service<GeminiCliServerState>().port

    if (actualPort == null) {
      LOG.warn("Cannot sync envars: port is null")
      return
    }

    val portInfo =
      PortInfo(
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
      this.token = authToken
      this.workspacePath = workspacePath
    }

    broadcastIdeContextUpdate()
  }

  private fun startKeepAliveForSession(
    sessionId: String,
    transport: StreamableHttpServerTransport
  ) {
    val keepAliveJob =
      coroutineScope.launch {
        while (isActive && transports.containsKey(sessionId)) {
          try {
            delay(KEEP_ALIVE_INTERVAL_MS)
            transport.send(JSONRPCNotification(jsonrpc = "2.0", method = "ping"))
          } catch (e: Exception) {
            LOG.warn("Failed to send keep-alive ping for session $sessionId: ${e.message}")
            cleanupSession(sessionId)
            break
          }
        }
      }
    keepAliveJobs[sessionId] = keepAliveJob
  }

  private fun sendInitialIdeContextToSession(
    sessionId: String,
    transport: StreamableHttpServerTransport
  ) {
    if (sessionsWithInitialNotification.contains(sessionId)) {
      return
    }

    val context = openFilesManager.getState()
    val contextJson = McpJson.encodeToJsonElement(context)
    val notification = JSONRPCNotification(method = "ide/contextUpdate", params = contextJson)

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
    keepAliveJobs[sessionId]?.cancel()
    keepAliveJobs.remove(sessionId)
    sessionsWithInitialNotification.remove(sessionId)
    transports.remove(sessionId)
  }

  fun stop() {
    transports.keys.toList().forEach { sessionId -> cleanupSession(sessionId) }
    coroutineScope.cancel()
    server?.stop(0)
    portFile?.delete()
    project.service<GeminiCliServerState>().apply {
      this.port = null
      this.token = null
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
    val notification = JSONRPCNotification(method = "ide/contextUpdate", params = contextJson)
    LOG.info(
      "IdeServer: Broadcasting IDE context update, open files: ${context.workspaceState?.openFiles?.size ?: 0}, active sessions: ${transports.size}"
    )
    broadcastNotification(notification)
  }

  private fun broadcastNotification(notification: JSONRPCNotification) {
    LOG.info(
      "IdeServer: Broadcasting notification to ${transports.size} sessions: ${notification.method}"
    )
    transports.forEach { (sessionId, transport) ->
      coroutineScope.launch {
        try {
          transport.send(notification)
          LOG.info(
            "IdeServer: Notification successfully sent to session $sessionId: ${notification.method}"
          )
        } catch (e: Exception) {
          LOG.warn("Failed to send notification to session $sessionId: ${e.message}")
          cleanupSession(sessionId)
        }
      }
    }
  }
}
