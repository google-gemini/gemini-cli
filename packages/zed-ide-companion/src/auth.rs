// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    pub auth_token: String,
    pub port: u16,
    pub workspace_path: String,
    pub sessions: Arc<tokio::sync::RwLock<std::collections::HashMap<String, Session>>>,
    pub diff_contents: Arc<tokio::sync::RwLock<std::collections::HashMap<String, String>>>,
    pub sse_txs: Arc<tokio::sync::RwLock<std::collections::HashMap<String, tokio::sync::mpsc::Sender<String>>>>,
}

/// An MCP session.
pub struct Session {
    pub initialized: bool,
    pub created_at: std::time::Instant,
}

/// Generate a new UUID v4 auth token.
pub fn generate_token() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Axum middleware that validates Bearer auth tokens.
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) => {
            let parts: Vec<&str> = header.splitn(2, ' ').collect();
            if parts.len() != 2 || parts[0] != "Bearer" || parts[1] != state.auth_token {
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
        None => return Err(StatusCode::UNAUTHORIZED),
    }

    Ok(next.run(req).await)
}

/// Axum middleware that rejects requests with an Origin header (CORS protection).
pub async fn cors_rejection_middleware(
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if req.headers().contains_key("origin") {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(next.run(req).await)
}

/// Axum middleware that validates the Host header.
pub async fn host_validation_middleware(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let host = req
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let port = state.port;
    let allowed = [
        format!("localhost:{}", port),
        format!("127.0.0.1:{}", port),
    ];

    if !allowed.iter().any(|h| h == host) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}
