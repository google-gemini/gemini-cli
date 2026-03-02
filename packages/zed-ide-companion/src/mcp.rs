// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// JSON-RPC request.
#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
    pub id: Option<Value>,
}

/// JSON-RPC response.
#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC error.
#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
}

/// Server info for MCP.
pub const SERVER_NAME: &str = "gemini-cli-zed-companion";
pub const SERVER_VERSION: &str = "1.0.0";
pub const PROTOCOL_VERSION: &str = "2025-03-26";

/// Build a successful JSON-RPC response.
pub fn success_response(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(result),
        error: None,
    }
}

/// Build an error JSON-RPC response.
pub fn error_response(id: Option<Value>, code: i64, message: &str) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.to_string(),
        }),
    }
}

/// Get the tool definitions.
pub fn tool_definitions() -> Value {
    json!({
        "tools": [
            {
                "name": "openDiff",
                "description": "(IDE Tool) Open a diff view to create or modify a file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "filePath": {
                            "type": "string",
                            "description": "The absolute path to the file to be diffed."
                        },
                        "newContent": {
                            "type": "string",
                            "description": "The proposed new content for the file."
                        }
                    },
                    "required": ["filePath", "newContent"]
                }
            },
            {
                "name": "closeDiff",
                "description": "(IDE Tool) Close an open diff view for a specific file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "filePath": {
                            "type": "string",
                            "description": "The absolute path to the file to be diffed."
                        },
                        "suppressNotification": {
                            "type": "boolean"
                        }
                    },
                    "required": ["filePath"]
                }
            }
        ]
    })
}

/// Build an initialize response.
pub fn initialize_response(id: Option<Value>, session_id: &str) -> JsonRpcResponse {
    success_response(
        id,
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "logging": {},
                "tools": {}
            },
            "serverInfo": {
                "name": SERVER_NAME,
                "version": SERVER_VERSION
            },
            "_meta": {
                "sessionId": session_id
            }
        }),
    )
}

/// Build a context update notification JSON string.
pub fn context_update_notification(workspace_path: &str) -> String {
    json!({
        "jsonrpc": "2.0",
        "method": "ide/contextUpdate",
        "params": {
            "workspaceState": {
                "openFiles": [],
                "isTrusted": true
            }
        }
    })
    .to_string()
}

/// Build a diff accepted notification JSON string.
pub fn diff_accepted_notification(file_path: &str, content: &str) -> String {
    json!({
        "jsonrpc": "2.0",
        "method": "ide/diffAccepted",
        "params": {
            "filePath": file_path,
            "content": content
        }
    })
    .to_string()
}

/// Build a diff rejected notification JSON string.
pub fn diff_rejected_notification(file_path: &str) -> String {
    json!({
        "jsonrpc": "2.0",
        "method": "ide/diffRejected",
        "params": {
            "filePath": file_path
        }
    })
    .to_string()
}
