package com.google.gemini.cli

import DiffManager
import com.google.gemini.cli.transport.StreamableHttpServerTransport
import com.intellij.openapi.components.service
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
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
  private val transport = StreamableHttpServerTransport(
    allowedHosts = listOf("localhost", "127.0.0.1", "host.docker.internal")
  )
  private val mcpServer = createMcpServer()

  companion object {
    private val LOG = Logger.getInstance(IdeServer::class.java)
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

    transport.setOnSessionInitialized { sessionId ->
      LOG.info("New MCP session initialized: $sessionId")
    }
  }

  suspend fun start() {
    mcpServer.connect(transport)
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
              transport.handlePostRequest(null, call)
            }
            sse("/mcp") {
              transport.handleGetRequest(this, call)
            }
            delete("/mcp") {
              transport.handleDeleteRequest(null, call)
            }
          }
        }.start(wait = false)

        val startedServer = server as io.ktor.server.engine.EmbeddedServer<*, *>
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

  private fun writePortInfo(port: Int) {
    val appInfo = ApplicationInfo.getInstance()
    val ideInfo = IdeInfo(
      name = appInfo.versionName.lowercase().replace(" ", ""),
      displayName = appInfo.fullApplicationName
    )

    val workspacePath = ProjectRootManager.getInstance(project).contentRoots.map { it.path }.joinToString(File.pathSeparator)

    val ppid = ProcessHandle.current().pid()

    val portInfo = PortInfo(
      port = port,
      authToken = authToken,
      ppid = ppid,
      ideInfo = ideInfo,
      workspacePath = workspacePath
    )
    val portInfoJson = McpJson.encodeToString(portInfo)

    val ideDir = File(System.getProperty("java.io.tmpdir"), "gemini/ide").apply { mkdirs() }
    portFile = File(ideDir, "gemini-ide-server-$ppid-$port.json").apply {
      writeText(portInfoJson)
      setReadable(true, true)
      setWritable(true, true)
      deleteOnExit()
    }
    LOG.info("Wrote port info to ${portFile?.absolutePath}")

    project.service<GeminiCliServerState>().apply {
      this.port = port
      this.workspacePath = workspacePath
    }
  }

  suspend fun stop() {
    if (server != null) {
      val startedServer = server as io.ktor.server.engine.EmbeddedServer<*, *>
      startedServer.stop(0, 0, java.util.concurrent.TimeUnit.MILLISECONDS)
    }
    portFile?.delete()
    transport.close()

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
    broadcastNotification(notification)
  }

  private fun broadcastNotification(notification: JSONRPCNotification) {
    runBlocking {
      try {
        transport.send(notification)
        LOG.debug("Notification sent: ${notification.method}")
      } catch (e: Exception) {
        LOG.warn("Failed to send notification: ${e.message}")
      }
    }
  }
}

