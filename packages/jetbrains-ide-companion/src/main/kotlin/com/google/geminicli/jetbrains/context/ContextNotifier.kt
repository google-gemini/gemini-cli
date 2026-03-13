/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.context

import com.google.geminicli.jetbrains.server.JsonRpcNotification
import com.google.geminicli.jetbrains.server.McpServer
import com.intellij.openapi.diagnostic.Logger
import com.intellij.util.Alarm
import kotlinx.serialization.json.*

/**
 * Debounces context change notifications and broadcasts them to all
 * connected MCP sessions.
 *
 * Matches the VS Code companion's 50ms debounce behavior.
 */
class ContextNotifier(
    private val mcpServer: McpServer,
    private val openFilesTracker: OpenFilesTracker,
) {
    private val log = Logger.getInstance(ContextNotifier::class.java)
    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD)

    companion object {
        private const val DEBOUNCE_MS = 50
    }

    /**
     * Schedule a debounced context update broadcast.
     */
    fun scheduleUpdate() {
        alarm.cancelAllRequests()
        alarm.addRequest({ broadcastContextUpdate() }, DEBOUNCE_MS)
    }

    /**
     * Immediately broadcast the current context to all sessions.
     */
    fun broadcastContextUpdate() {
        val notification = buildContextNotification()
        mcpServer.broadcast(notification)
    }

    /**
     * Build the notification for a specific transport (e.g., on new session).
     */
    fun buildContextNotification(): JsonRpcNotification {
        val openFiles = openFilesTracker.getOpenFiles()

        val filesArray = buildJsonArray {
            for (file in openFiles) {
                add(buildJsonObject {
                    put("path", file.path)
                    put("timestamp", file.timestamp)
                    if (file.isActive) {
                        put("isActive", true)
                    }
                    file.selectedText?.let { put("selectedText", it) }
                    file.cursor?.let { cursor ->
                        put("cursor", buildJsonObject {
                            put("line", cursor.line)
                            put("character", cursor.character)
                        })
                    }
                })
            }
        }

        val params = buildJsonObject {
            put("workspaceState", buildJsonObject {
                put("openFiles", filesArray)
                put("isTrusted", true)
            })
        }

        return JsonRpcNotification(
            method = "ide/contextUpdate",
            params = params,
        )
    }

    fun dispose() {
        alarm.cancelAllRequests()
    }
}
