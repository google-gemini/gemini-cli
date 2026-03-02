// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

use crate::auth::{
    auth_middleware, cors_rejection_middleware, host_validation_middleware, AppState, Session,
};
use crate::mcp::{
    self, error_response, initialize_response, success_response, JsonRpcRequest, JsonRpcResponse,
};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    middleware,
    response::{
        sse::{Event, Sse},
        IntoResponse, Json,
    },
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

/// Create the axum router with all middleware and routes.
pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/mcp", post(handle_post))
        .route("/mcp", get(handle_get_sse))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            host_validation_middleware,
        ))
        .layer(middleware::from_fn(cors_rejection_middleware))
        .with_state(state)
}

/// Start the server on a random port. Returns the port.
pub async fn start(state: Arc<AppState>) -> Result<(u16, tokio::task::JoinHandle<()>), String> {
    let router = create_router(state.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind: {}", e))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to get addr: {}", e))?;
    let port = addr.port();

    let handle = tokio::spawn(async move {
        axum::serve(listener, router).await.ok();
    });

    Ok((port, handle))
}

/// Handle POST /mcp - JSON-RPC requests.
async fn handle_post(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<JsonRpcRequest>,
) -> impl IntoResponse {
    let session_id_header = headers
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    match request.method.as_str() {
        "initialize" => {
            let session_id = uuid::Uuid::new_v4().to_string();
            {
                let mut sessions = state.sessions.write().await;
                sessions.insert(
                    session_id.clone(),
                    Session {
                        initialized: true,
                        created_at: std::time::Instant::now(),
                    },
                );
            }
            let response = initialize_response(request.id, &session_id);
            let mut resp_headers = HeaderMap::new();
            resp_headers.insert("mcp-session-id", session_id.parse().unwrap());
            (StatusCode::OK, resp_headers, Json(response))
        }
        _ => {
            // Require valid session
            let session_id = match session_id_header {
                Some(id) => id,
                None => {
                    let response =
                        error_response(request.id, -32000, "Bad Request: No valid session ID provided for non-initialize request.");
                    return (StatusCode::BAD_REQUEST, HeaderMap::new(), Json(response));
                }
            };

            {
                let sessions = state.sessions.read().await;
                if !sessions.contains_key(&session_id) {
                    let response = error_response(
                        request.id,
                        -32000,
                        "Bad Request: No valid session ID provided for non-initialize request.",
                    );
                    return (StatusCode::BAD_REQUEST, HeaderMap::new(), Json(response));
                }
            }

            let response = dispatch_request(request, &state).await;
            let mut resp_headers = HeaderMap::new();
            resp_headers.insert("mcp-session-id", session_id.parse().unwrap());
            (StatusCode::OK, resp_headers, Json(response))
        }
    }
}

/// Dispatch a JSON-RPC request to the appropriate handler.
async fn dispatch_request(request: JsonRpcRequest, state: &AppState) -> JsonRpcResponse {
    match request.method.as_str() {
        "tools/list" => success_response(request.id, mcp::tool_definitions()),
        "tools/call" => handle_tools_call(request, state).await,
        "notifications/initialized" => success_response(request.id, json!({})),
        "ping" => success_response(request.id, json!({})),
        _ => error_response(
            request.id,
            -32601,
            &format!("Method not found: {}", request.method),
        ),
    }
}

/// Handle tools/call requests.
async fn handle_tools_call(request: JsonRpcRequest, state: &AppState) -> JsonRpcResponse {
    let params = &request.params;
    let tool_name = params
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

    match tool_name {
        "openDiff" => {
            let file_path = arguments
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let new_content = arguments
                .get("newContent")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if file_path.is_empty() || new_content.is_empty() {
                return error_response(
                    request.id,
                    -32602,
                    "Invalid params: filePath and newContent required",
                );
            }

            {
                let mut diffs = state.diff_contents.write().await;
                diffs.insert(file_path.to_string(), new_content.to_string());
            }

            success_response(request.id, json!({ "content": [] }))
        }
        "closeDiff" => {
            let file_path = arguments
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if file_path.is_empty() {
                return error_response(
                    request.id,
                    -32602,
                    "Invalid params: filePath required",
                );
            }

            let content = {
                let mut diffs = state.diff_contents.write().await;
                diffs.remove(file_path)
            };

            match content {
                Some(c) => success_response(
                    request.id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": serde_json::to_string(&json!({ "content": c })).unwrap()
                        }]
                    }),
                ),
                None => success_response(
                    request.id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": serde_json::to_string(&json!({ "content": null })).unwrap()
                        }]
                    }),
                ),
            }
        }
        _ => error_response(
            request.id,
            -32601,
            &format!("Tool not found: {}", tool_name),
        ),
    }
}

/// Handle GET /mcp - SSE streaming endpoint.
async fn handle_get_sse(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    let session_id = headers
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let session_id = match session_id {
        Some(id) => id,
        None => return Err(StatusCode::BAD_REQUEST),
    };

    {
        let sessions = state.sessions.read().await;
        if !sessions.contains_key(&session_id) {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    let (tx, rx) = mpsc::channel::<String>(32);

    // Store the sender for broadcasting
    {
        let mut sse_txs = state.sse_txs.write().await;
        sse_txs.insert(session_id.clone(), tx.clone());
    }

    // Send initial context update
    let workspace_path = state.workspace_path.clone();
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let notification = mcp::context_update_notification(&workspace_path);
        let _ = tx_clone.send(notification).await;
    });

    let stream = ReceiverStream::new(rx).map(|data| Ok(Event::default().data(data)));

    Ok(Sse::new(stream))
}

/// Broadcast an SSE event to all connected clients.
pub async fn broadcast(state: &AppState, data: &str) {
    let sse_txs = state.sse_txs.read().await;
    for (_session_id, tx) in sse_txs.iter() {
        let _ = tx.send(data.to_string()).await;
    }
}
