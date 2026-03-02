/*
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

package com.google.geminicli.jetbrains.server

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/**
 * JSON-RPC 2.0 message types and MCP protocol helpers.
 */

@Serializable
data class JsonRpcRequest(
    val jsonrpc: String = "2.0",
    val method: String,
    val params: JsonObject? = null,
    val id: JsonElement? = null,
)

@Serializable
data class JsonRpcResponse(
    val jsonrpc: String = "2.0",
    val result: JsonElement? = null,
    val error: JsonRpcError? = null,
    val id: JsonElement? = null,
)

@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
    val data: JsonElement? = null,
)

@Serializable
data class JsonRpcNotification(
    val jsonrpc: String = "2.0",
    val method: String,
    val params: JsonObject? = null,
)

// MCP-specific types

@Serializable
data class ServerInfo(
    val name: String,
    val version: String,
)

@Serializable
data class ServerCapabilities(
    val logging: JsonObject? = JsonObject(emptyMap()),
)

@Serializable
data class InitializeResult(
    val protocolVersion: String = "2025-03-26",
    val capabilities: ServerCapabilities = ServerCapabilities(),
    val serverInfo: ServerInfo = ServerInfo(
        name = "gemini-cli-jetbrains-companion",
        version = "1.0.0"
    ),
)

@Serializable
data class ToolInputSchema(
    val type: String = "object",
    val properties: JsonObject,
    val required: List<String>? = null,
)

@Serializable
data class ToolDefinition(
    val name: String,
    val description: String,
    val inputSchema: ToolInputSchema,
)

@Serializable
data class ToolsListResult(
    val tools: List<ToolDefinition>,
)

@Serializable
data class ToolContent(
    val type: String = "text",
    val text: String,
)

@Serializable
data class ToolCallResult(
    val content: List<ToolContent> = emptyList(),
    @SerialName("isError")
    val isError: Boolean = false,
)

/**
 * Session state for a connected MCP client.
 */
data class McpSession(
    val sessionId: String,
    val transport: McpTransport,
    var missedPings: Int = 0,
)
