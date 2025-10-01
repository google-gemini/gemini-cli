package com.google.gemini.cli

import DiffManager
import com.google.gson.Gson
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sse.sse
import io.modelcontextprotocol.kotlin.sdk.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.Implementation
import io.modelcontextprotocol.kotlin.sdk.ServerCapabilities
import io.modelcontextprotocol.kotlin.sdk.TextContent
import io.modelcontextprotocol.kotlin.sdk.Tool
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.ServerOptions
import io.modelcontextprotocol.kotlin.sdk.server.SseServerTransport
import kotlinx.coroutines.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.security.SecureRandom
import java.util.*
import java.util.concurrent.ConcurrentHashMap

class McpSseIdeServer(private val project: Project, private val diffManager: DiffManager) {
    private var server: Any? = null
    private var portFile: File? = null
    private val gson = Gson()
    private val authToken = generateAuthToken()
    private val activeTransports = ConcurrentHashMap<String, SseServerTransport>()
    private val sessionsWithInitialNotification = ConcurrentHashMap<String, Boolean>()
    private val mcpServer = createMcpServer()

    companion object {
        private val LOG = Logger.getInstance(McpSseIdeServer::class.java)
        private const val MCP_SESSION_ID_HEADER = "mcp-session-id"
    }

    fun start() {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                server = embeddedServer(Netty, port = 0, host = "127.0.0.1") {
                    install(CORS) {
                        allowMethod(HttpMethod.Options)
                        allowMethod(HttpMethod.Post)
                        allowMethod(HttpMethod.Get)
                        allowHeader(HttpHeaders.ContentType)
                        allowHeader(HttpHeaders.Authorization)
                        allowHeader(MCP_SESSION_ID_HEADER)
                        allowHost("localhost", listOf("http", "https"))
                        allowHost("127.0.0.1", listOf("http", "https"))
                        allowNonSimpleContentTypes = true
                    }

                    routing {
                        sse("/mcp") {
                            val authHeader = call.request.headers[HttpHeaders.Authorization]
                            if (authHeader != "Bearer $authToken") {
                                LOG.warn("Unauthorized SSE connection attempt.")
                                call.respond(HttpStatusCode.Unauthorized, "Unauthorized")
                                return@sse
                            }

                            val transport = SseServerTransport("/mcp", this)
                            LOG.info("New SSE session created: ${transport.sessionId}")
                            activeTransports[transport.sessionId] = transport

                            mcpServer.onClose {
                                LOG.info("MCP server session closed for sessionId: ${transport.sessionId}")
                                activeTransports.remove(transport.sessionId)
                            }

                            try {
                                mcpServer.connect(transport)
                            } catch (e: Exception) {
                                LOG.error("Error during MCP session: ${e.message}", e)
                            } finally {
                                LOG.info("SSE session ended: ${transport.sessionId}")
                                activeTransports.remove(transport.sessionId)
                            }
                        }

                        post("/mcp") {
                            val sessionId = call.parameters["sessionId"]
                            if (sessionId == null) {
                                call.respond(HttpStatusCode.BadRequest, "Missing sessionId parameter")
                                return@post
                            }

                            val transport = activeTransports[sessionId]
                            if (transport == null) {
                                call.respond(HttpStatusCode.BadRequest, "Invalid session ID")
                                return@post
                            }

                            transport.handlePostMessage(call)
                        }
                    }
                }.start(wait = false)

                val startedServer = server as io.ktor.server.engine.EmbeddedServer<*, *>
                val port = runBlocking { startedServer.engine.resolvedConnectors().first().port }
                LOG.info("MCP IDE Server V2 started on port $port")
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
            inputSchema = Tool.Input()
        ) { request ->
            val filePath = request.arguments["filePath"]?.toString() ?: throw IllegalArgumentException("filePath is required")
            val newContent = request.arguments["newContent"]?.toString() ?: throw IllegalArgumentException("newContent is required")

            ApplicationManager.getApplication().invokeLater {
                diffManager.showDiff(filePath, newContent)
            }

            CallToolResult(
                content = listOf(
                    TextContent("Diff opened for file: $filePath")
                )
            )
        }

        return server
    }

    private fun writePortInfo(port: Int) {
        val appInfo = ApplicationInfo.getInstance()
        val ideInfo = mapOf(
            "name" to appInfo.versionName.lowercase().replace(" ", ""),
            "displayName" to appInfo.fullApplicationName
        )

        val workspacePath = ProjectRootManager.getInstance(project).contentRoots.map { it.path }.joinToString(File.pathSeparator)

        val tempDir = System.getProperty("java.io.tmpdir")
        val portInfo = mapOf(
            "port" to port,
            "authToken" to authToken,
            "ppid" to ProcessHandle.current().pid(),
            "ideInfo" to ideInfo,
            "workspacePath" to workspacePath
        )
        portFile = File(tempDir, "gemini-ide-server-$port.json").apply {
            writeText(gson.toJson(portInfo))
            setReadable(true, true)
            setWritable(true, true)
            deleteOnExit()
        }
        File(tempDir, "gemini-ide-server-${ProcessHandle.current().pid()}.json").apply {
            writeText(gson.toJson(portInfo))
            setReadable(true, true)
            setWritable(true, true)
            deleteOnExit()
        }
        LOG.info("Wrote port info to ${portFile?.absolutePath}")
    }

    fun getServerPort(): Int? {
        return if (server != null) {
            val startedServer = server as io.ktor.server.engine.EmbeddedServer<*, *>
            runBlocking { startedServer.engine.resolvedConnectors().first().port }
        } else {
            null
        }
    }

    fun stop() {
        if (server != null) {
            val startedServer = server as io.ktor.server.engine.EmbeddedServer<*, *>
            startedServer.stop(0, 0, java.util.concurrent.TimeUnit.MILLISECONDS)
        }
        portFile?.delete()
        activeTransports.clear()
        sessionsWithInitialNotification.clear()
        LOG.info("MCP IDE Server V2 stopped")
    }

    private fun generateAuthToken(): String {
        val random = SecureRandom()
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getEncoder().encodeToString(bytes)
    }

    fun notifyDiffAccepted(filePath: String) {
        LOG.info("Diff accepted for file: $filePath")
        broadcastNotification("diff_accepted", mapOf("filePath" to filePath))
    }

    fun notifyDiffClosed(filePath: String) {
        LOG.info("Diff closed for file: $filePath")
        broadcastNotification("diff_closed", mapOf("filePath" to filePath))
    }

    private fun broadcastNotification(method: String, params: Map<String, Any>) {
        runBlocking {
            val notification = io.modelcontextprotocol.kotlin.sdk.JSONRPCNotification(
                method = method,
                params = buildJsonObject {
                    params.forEach { (key, value) ->
                        put(key, value.toString())
                    }
                }
            )

            activeTransports.values.forEach { transport ->
                try {
                    transport.send(notification)
                    LOG.debug("Notification sent to session ${transport.sessionId}: $method")
                } catch (e: Exception) {
                    LOG.warn("Failed to send notification to session ${transport.sessionId}: ${e.message}")
                }
            }
        }
    }

}
