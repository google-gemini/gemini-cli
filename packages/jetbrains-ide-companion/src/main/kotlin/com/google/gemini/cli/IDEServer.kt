package com.google.gemini.cli

import DiffManager
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.io.OutputStream
import java.net.InetSocketAddress
import java.security.SecureRandom
import java.util.*
import java.util.concurrent.ConcurrentHashMap

class IDEServer(private val diffManager: DiffManager) {
    private var server: HttpServer? = null
    private var portFile: File? = null
    private val gson = Gson()
    private val authToken = generateAuthToken()
    private val notificationStreams = ConcurrentHashMap<String, OutputStream>()

    companion object {
        private val LOG = Logger.getInstance(IDEServer::class.java)
        private const val MCP_SESSION_ID_HEADER = "mcp-session-id"
    }

    fun start() {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
                    createContext("/mcp") { exchange ->
                        try {
                            val authHeader = exchange.requestHeaders.getFirst("Authorization")
                            if (authHeader != "Bearer $authToken") {
                                LOG.warn("Unauthorized MCP request received")
                                exchange.sendResponseHeaders(401, -1)
                                return@createContext
                            }

                            when (exchange.requestMethod) {
                                "GET" -> handleNotificationStream(exchange)
                                "POST" -> handlePostRequest(exchange)
                                else -> exchange.sendResponseHeaders(405, -1) // Method Not Allowed
                            }
                        } catch (e: Exception) {
                            LOG.error("Error handling MCP request", e)
                            if (exchange.responseCode == -1) {
                                exchange.sendResponseHeaders(500, -1)
                            }
                        } finally {
                            // For GET requests, the stream is kept open, so we don't close the exchange here.
                            if (exchange.requestMethod != "GET") {
                                exchange.close()
                            }
                        }
                    }
                    start()
                }

                val port = server!!.address.port
                LOG.info("IDE Server started on port $port")
                writePortInfo(port)

            } catch (e: Exception) {
                LOG.error("Failed to start IDE Server", e)
            }
        }
    }

    private fun handleNotificationStream(exchange: HttpExchange) {
        val sessionId = exchange.requestHeaders.getFirst(MCP_SESSION_ID_HEADER)
        if (sessionId == null) {
            exchange.sendResponseHeaders(400, -1) // Bad Request
            exchange.close()
            return
        }

        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(200, 0) // Must send headers before getting body

        notificationStreams[sessionId] = exchange.responseBody
        LOG.info("Notification stream opened for session: $sessionId")
        // The connection is kept open to push notifications.
    }

    private fun handlePostRequest(exchange: HttpExchange) {
        val requestBody = exchange.requestBody.reader().readText()
        val jsonRequest = JsonParser.parseString(requestBody).asJsonObject

        val response = when (val method = jsonRequest.get("method").asString) {
            "openDiff" -> handleOpenDiff(jsonRequest.get("params").asJsonObject)
            "initialize" -> handleInitialize()
            else -> {
                LOG.warn("Unknown MCP method: $method")
                JsonObject().apply { addProperty("error", "Unknown method: $method") }
            }
        }

        val responseBody = gson.toJson(response).toByteArray()
        exchange.sendResponseHeaders(200, responseBody.size.toLong())
        exchange.responseBody.write(responseBody)
    }

    private fun handleInitialize(): JsonObject {
        val sessionId = UUID.randomUUID().toString()
        LOG.info("New session initialized: $sessionId")
        return JsonObject().apply {
            add("result", JsonObject().apply {
                addProperty("sessionId", sessionId)
            })
        }
    }

    private fun handleOpenDiff(params: JsonObject): JsonObject {
        return try {
            val filePath = params.get("filePath").asString
            val newContent = params.get("newContent").asString
            ApplicationManager.getApplication().invokeLater {
                diffManager.showDiff(filePath, newContent)
            }
            JsonObject().apply { addProperty("result", "Diff request received") }
        } catch (e: Exception) {
            LOG.error("Failed to handle openDiff", e)
            JsonObject().apply { addProperty("error", e.message) }
        }
    }

    private fun writePortInfo(port: Int) {
        val tempDir = System.getProperty("java.io.tmpdir")
        val portInfo = mapOf("port" to port, "authToken" to authToken, "ppid" to ProcessHandle.current().pid())
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

    fun stop() {
        server?.stop(0)
        portFile?.delete()
        LOG.info("IDE Server stopped")
    }

    private fun generateAuthToken(): String {
        val random = SecureRandom()
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getEncoder().encodeToString(bytes)
    }

    fun notifyDiffAccepted(filePath: String, content: String) {
        val notification = JsonObject().apply {
            addProperty("jsonrpc", "2.0")
            addProperty("method", "ide/diffAccepted")
            add("params", JsonObject().apply {
                addProperty("filePath", filePath)
                addProperty("content", content)
            })
        }
        sendNotification(notification)
    }

    fun notifyDiffClosed(filePath: String, content: String) {
        val notification = JsonObject().apply {
            addProperty("jsonrpc", "2.0")
            addProperty("method", "ide/diffClosed")
            add("params", JsonObject().apply {
                addProperty("filePath", filePath)
                addProperty("content", content)
            })
        }
        sendNotification(notification)
    }

    private fun sendNotification(notification: JsonObject) {
        val notificationJson = gson.toJson(notification) + "\n"
        LOG.info("Sending notification: $notificationJson")
        notificationStreams.values.forEach { stream ->
            try {
                stream.write(notificationJson.toByteArray())
                stream.flush()
            } catch (e: Exception) {
                LOG.warn("Failed to send notification to a client", e)
            }
        }
    }
}
