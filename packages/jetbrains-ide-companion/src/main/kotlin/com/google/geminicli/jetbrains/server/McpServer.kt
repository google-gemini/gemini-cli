/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.server

import com.google.geminicli.jetbrains.diff.DiffTool
import com.intellij.openapi.diagnostic.Logger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Lightweight MCP-over-HTTP server using JDK's built-in HttpServer.
 * Avoids Ktor dependency to prevent classpath conflicts with IntelliJ's
 * bundled libraries.
 *
 * Matches the VS Code companion protocol exactly:
 * - POST /mcp → JSON-RPC request handler
 * - GET /mcp → SSE streaming endpoint for notifications
 */
class McpServer(
    private val diffTool: DiffTool,
) {
    private val log = Logger.getInstance(McpServer::class.java)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private var httpServer: HttpServer? = null
    private var httpExecutor: java.util.concurrent.ExecutorService? = null
    var port: Int = 0
        private set
    var authToken: String = UUID.randomUUID().toString()
        private set

    private val sessions = ConcurrentHashMap<String, McpSession>()
    private val sessionsWithInitialNotification = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "gemini-mcp-keepalive").apply { isDaemon = true }
    }
    private var keepAliveTask: ScheduledFuture<*>? = null

    // Callback for sending context updates to new sessions
    var onNewSession: ((McpTransport) -> Unit)? = null

    fun start() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val executor = Executors.newFixedThreadPool(4) { r ->
            Thread(r, "gemini-mcp-http").apply { isDaemon = true }
        }
        server.executor = executor
        this.httpExecutor = executor

        server.createContext("/mcp") { exchange ->
            try {
                val authResult = AuthMiddleware.validate(exchange, port, authToken)
                if (authResult is AuthResult.Rejected) {
                    sendResponse(exchange, authResult.statusCode, authResult.message)
                    return@createContext
                }

                when (exchange.requestMethod) {
                    "POST" -> handlePost(exchange)
                    "GET" -> handleGet(exchange)
                    else -> sendResponse(exchange, 405, "Method Not Allowed")
                }
            } catch (e: Exception) {
                log.warn("Error handling MCP request", e)
                try {
                    sendResponse(exchange, 500, "Internal Server Error")
                } catch (_: Exception) {
                    // Already closed
                }
            }
        }

        server.start()
        this.httpServer = server
        this.port = server.address.port
        log.info("MCP server listening on http://127.0.0.1:$port")

        // Start keep-alive pings every 60 seconds
        keepAliveTask = scheduler.scheduleAtFixedRate({
            for ((sessionId, session) in sessions) {
                val success = session.transport.sendPing()
                if (success) {
                    session.missedPings = 0
                } else {
                    session.missedPings++
                    log.info("Session $sessionId missed ${session.missedPings} pings")
                    if (session.missedPings >= 3) {
                        log.info("Cleaning up session $sessionId after 3 missed pings")
                        session.transport.close()
                        sessions.remove(sessionId)
                        sessionsWithInitialNotification.remove(sessionId)
                    }
                }
            }
        }, 60, 60, TimeUnit.SECONDS)
    }

    fun stop() {
        keepAliveTask?.cancel(false)
        for ((_, session) in sessions) {
            session.transport.close()
        }
        sessions.clear()
        sessionsWithInitialNotification.clear()
        httpServer?.stop(1)
        httpServer = null
        httpExecutor?.shutdownNow()
        httpExecutor = null
        scheduler.shutdownNow()
        log.info("MCP server stopped")
    }

    /**
     * Broadcast a JSON-RPC notification to all connected sessions.
     */
    fun broadcast(notification: JsonRpcNotification) {
        for ((_, session) in sessions) {
            session.transport.sendNotification(notification)
        }
    }

    private fun handlePost(exchange: HttpExchange) {
        val body = exchange.requestBody.bufferedReader().readText()
        val request = try {
            json.decodeFromString<JsonRpcRequest>(body)
        } catch (e: Exception) {
            sendJsonResponse(exchange, 400, JsonRpcResponse(
                error = JsonRpcError(-32700, "Parse error: ${e.message}"),
                id = null,
            ))
            return
        }

        val sessionId = exchange.requestHeaders.getFirst("mcp-session-id")

        // Route to existing session or create new one for initialize
        if (sessionId != null && sessions.containsKey(sessionId)) {
            // Existing session
            val response = dispatchRequest(request)
            sendJsonResponse(exchange, 200, response)
        } else if (sessionId == null && request.method == "initialize") {
            // New session
            val newSessionId = UUID.randomUUID().toString()
            val transport = McpTransport()
            val session = McpSession(newSessionId, transport)
            sessions[newSessionId] = session

            log.info("New MCP session initialized: $newSessionId")

            val response = dispatchRequest(request)
            exchange.responseHeaders.set("mcp-session-id", newSessionId)
            sendJsonResponse(exchange, 200, response)
        } else {
            sendJsonResponse(exchange, 400, JsonRpcResponse(
                error = JsonRpcError(-32000, "Bad Request: No valid session ID provided for non-initialize request."),
                id = request.id,
            ))
        }
    }

    private fun handleGet(exchange: HttpExchange) {
        val sessionId = exchange.requestHeaders.getFirst("mcp-session-id")
        if (sessionId == null || !sessions.containsKey(sessionId)) {
            sendResponse(exchange, 400, "Invalid or missing session ID")
            return
        }

        val session = sessions[sessionId]!!
        session.transport.attachSse(exchange)

        // Send initial context update
        if (!sessionsWithInitialNotification.contains(sessionId)) {
            onNewSession?.invoke(session.transport)
            sessionsWithInitialNotification.add(sessionId)
        }

        // Keep connection open for SSE — the exchange will be held by the transport
    }

    private fun dispatchRequest(request: JsonRpcRequest): JsonRpcResponse {
        return when (request.method) {
            "initialize" -> {
                val result = InitializeResult()
                JsonRpcResponse(
                    result = json.encodeToJsonElement(result),
                    id = request.id,
                )
            }
            "notifications/initialized" -> {
                // Client acknowledgment — no response needed for notifications
                JsonRpcResponse(result = JsonObject(emptyMap()), id = request.id)
            }
            "tools/list" -> {
                val result = ToolsListResult(tools = getToolDefinitions())
                JsonRpcResponse(
                    result = json.encodeToJsonElement(result),
                    id = request.id,
                )
            }
            "tools/call" -> {
                handleToolCall(request)
            }
            "ping" -> {
                JsonRpcResponse(result = JsonObject(emptyMap()), id = request.id)
            }
            else -> {
                JsonRpcResponse(
                    error = JsonRpcError(-32601, "Method not found: ${request.method}"),
                    id = request.id,
                )
            }
        }
    }

    private fun handleToolCall(request: JsonRpcRequest): JsonRpcResponse {
        val params = request.params ?: return JsonRpcResponse(
            error = JsonRpcError(-32602, "Missing params"),
            id = request.id,
        )

        val toolName = params["name"]?.jsonPrimitive?.contentOrNull
        val arguments = params["arguments"]?.jsonObject

        if (toolName == null || arguments == null) {
            return JsonRpcResponse(
                error = JsonRpcError(-32602, "Missing tool name or arguments"),
                id = request.id,
            )
        }

        return when (toolName) {
            "openDiff" -> {
                val filePath = arguments["filePath"]?.jsonPrimitive?.contentOrNull ?: ""
                val newContent = arguments["newContent"]?.jsonPrimitive?.contentOrNull ?: ""

                log.info("Received openDiff request for: $filePath")
                diffTool.openDiff(filePath, newContent)

                val result = ToolCallResult(content = emptyList())
                JsonRpcResponse(
                    result = json.encodeToJsonElement(result),
                    id = request.id,
                )
            }
            "closeDiff" -> {
                val filePath = arguments["filePath"]?.jsonPrimitive?.contentOrNull ?: ""

                log.info("Received closeDiff request for: $filePath")
                val content = diffTool.closeDiff(filePath)

                val responseObj = buildJsonObject {
                    if (content != null) {
                        put("content", content)
                    } else {
                        put("content", JsonNull)
                    }
                }

                val result = ToolCallResult(
                    content = listOf(ToolContent(text = responseObj.toString()))
                )
                JsonRpcResponse(
                    result = json.encodeToJsonElement(result),
                    id = request.id,
                )
            }
            else -> {
                JsonRpcResponse(
                    error = JsonRpcError(-32602, "Unknown tool: $toolName"),
                    id = request.id,
                )
            }
        }
    }

    private fun getToolDefinitions(): List<ToolDefinition> {
        return listOf(
            ToolDefinition(
                name = "openDiff",
                description = "(IDE Tool) Open a diff view to create or modify a file. Returns a notification once the diff has been accepted or rejected.",
                inputSchema = ToolInputSchema(
                    properties = buildJsonObject {
                        put("filePath", buildJsonObject {
                            put("type", JsonPrimitive("string"))
                            put("description", JsonPrimitive("The absolute path to the file to be diffed."))
                        })
                        put("newContent", buildJsonObject {
                            put("type", JsonPrimitive("string"))
                            put("description", JsonPrimitive("The proposed new content for the file."))
                        })
                    },
                    required = listOf("filePath", "newContent"),
                ),
            ),
            ToolDefinition(
                name = "closeDiff",
                description = "(IDE Tool) Close an open diff view for a specific file.",
                inputSchema = ToolInputSchema(
                    properties = buildJsonObject {
                        put("filePath", buildJsonObject {
                            put("type", JsonPrimitive("string"))
                            put("description", JsonPrimitive("The absolute path to the file to be diffed."))
                        })
                    },
                    required = listOf("filePath"),
                ),
            ),
        )
    }

    private fun sendJsonResponse(exchange: HttpExchange, statusCode: Int, response: JsonRpcResponse) {
        val responseBody = json.encodeToString(response)
        exchange.responseHeaders.set("Content-Type", "application/json")
        val bytes = responseBody.toByteArray(Charsets.UTF_8)
        exchange.sendResponseHeaders(statusCode, bytes.size.toLong())
        exchange.responseBody.write(bytes)
        exchange.responseBody.close()
    }

    private fun sendResponse(exchange: HttpExchange, statusCode: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        exchange.sendResponseHeaders(statusCode, bytes.size.toLong())
        exchange.responseBody.write(bytes)
        exchange.responseBody.close()
    }
}
