/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.diff

import com.google.geminicli.jetbrains.server.JsonRpcNotification
import com.google.geminicli.jetbrains.server.McpServer
import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Handles openDiff and closeDiff tool calls from the MCP protocol.
 * Delegates to DiffViewManager for IDE-specific diff display.
 */
class DiffTool(
    private val diffViewManager: DiffViewManager,
) {
    private val log = Logger.getInstance(DiffTool::class.java)
    var mcpServer: McpServer? = null

    /**
     * Open a diff view for the given file with proposed new content.
     */
    fun openDiff(filePath: String, newContent: String) {
        log.info("Opening diff for: $filePath")
        diffViewManager.showDiff(filePath, newContent) { result ->
            when (result) {
                is DiffResult.Accepted -> {
                    log.info("Diff accepted for: $filePath")
                    val notification = JsonRpcNotification(
                        method = "ide/diffAccepted",
                        params = buildJsonObject {
                            put("filePath", filePath)
                            put("content", result.content)
                        },
                    )
                    mcpServer?.broadcast(notification)
                }
                is DiffResult.Rejected -> {
                    log.info("Diff rejected for: $filePath")
                    val notification = JsonRpcNotification(
                        method = "ide/diffRejected",
                        params = buildJsonObject {
                            put("filePath", filePath)
                        },
                    )
                    mcpServer?.broadcast(notification)
                }
            }
        }
    }

    /**
     * Close an open diff view and return the current content.
     */
    fun closeDiff(filePath: String): String? {
        log.info("Closing diff for: $filePath")
        return diffViewManager.closeDiff(filePath)
    }
}

sealed class DiffResult {
    data class Accepted(val content: String) : DiffResult()
    data object Rejected : DiffResult()
}
