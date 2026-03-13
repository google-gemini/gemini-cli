/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.server

import com.sun.net.httpserver.HttpExchange
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.Closeable
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Server-Sent Events (SSE) transport for pushing notifications to connected
 * MCP clients. Each session gets its own transport instance.
 */
class McpTransport : Closeable {
    private val eventQueue = LinkedBlockingQueue<String>()
    @Volatile
    private var closed = false
    private var sseExchange: HttpExchange? = null

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    val isClosed: Boolean get() = closed

    /**
     * Send a JSON-RPC notification to the client via SSE.
     */
    fun sendNotification(notification: JsonRpcNotification) {
        if (closed) return
        val data = json.encodeToString(notification)
        eventQueue.offer(data)
        flushSse()
    }

    /**
     * Send a keep-alive ping. Returns false if the transport is closed.
     */
    fun sendPing(): Boolean {
        if (closed) return false
        val ping = JsonRpcNotification(method = "ping")
        val data = json.encodeToString(ping)
        eventQueue.offer(data)
        return try {
            flushSse()
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Attach an SSE HTTP exchange for streaming. Called when a GET /mcp
     * request is received for this session.
     */
    fun attachSse(exchange: HttpExchange) {
        this.sseExchange = exchange
        exchange.responseHeaders.set("Content-Type", "text/event-stream")
        exchange.responseHeaders.set("Cache-Control", "no-cache")
        exchange.responseHeaders.set("Connection", "keep-alive")
        exchange.sendResponseHeaders(200, 0)
        // Flush any queued events
        flushSse()
    }

    private fun flushSse() {
        val exchange = sseExchange ?: return
        try {
            val os = exchange.responseBody
            while (true) {
                val event = eventQueue.poll(0, TimeUnit.MILLISECONDS) ?: break
                val sseData = "data: $event\n\n"
                os.write(sseData.toByteArray(Charsets.UTF_8))
                os.flush()
            }
        } catch (_: Exception) {
            closed = true
        }
    }

    override fun close() {
        closed = true
        try {
            sseExchange?.close()
        } catch (_: Exception) {
            // Ignore
        }
    }
}
