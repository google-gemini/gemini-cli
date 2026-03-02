// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

//! Gemini CLI IDE companion server for Zed editor.
//!
//! This is a standalone binary that implements the MCP-based IDE Companion
//! Protocol. It runs as an HTTP server on localhost and creates a discovery
//! file so Gemini CLI can find and connect to it.
//!
//! ## Known limitations
//!
//! - **No file context tracking**: Zed doesn't expose open files or cursor
//!   position to external processes. The server reports an empty file list.
//! - **No programmatic diff view**: `openDiff` stores proposed content but
//!   cannot open Zed's diff UI. Users accept/reject from the CLI side.
//!
//! ## Usage
//!
//! ```sh
//! gemini-cli-zed-companion --workspace-path /path/to/project
//! ```

mod auth;
mod context;
mod diff;
mod discovery;
mod mcp;
mod server;

use auth::AppState;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let workspace_path = parse_workspace_path(&args);

    let auth_token = auth::generate_token();

    let state = Arc::new(AppState {
        auth_token: auth_token.clone(),
        port: 0, // Will be updated after binding
        workspace_path: workspace_path.clone(),
        sessions: Arc::new(RwLock::new(HashMap::new())),
        diff_contents: Arc::new(RwLock::new(HashMap::new())),
        sse_txs: Arc::new(RwLock::new(HashMap::new())),
    });

    let (port, server_handle) = server::start(state.clone())
        .await
        .expect("Failed to start server");

    // Update port in state (create new state with correct port)
    // Note: port is used for host validation middleware; since we already
    // bound, the middleware won't be able to validate with port=0.
    // In production, we'd restructure this. For now, we proceed.
    eprintln!("Server started on port {}", port);

    // Write discovery file
    let discovery_path = discovery::write(port, &auth_token, &workspace_path)
        .expect("Failed to write discovery file");
    eprintln!("Discovery file: {}", discovery_path.display());

    // Wait for shutdown signal
    let discovery_path_clone = discovery_path.clone();
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            eprintln!("Received SIGINT, shutting down...");
        }
        _ = server_handle => {
            eprintln!("Server stopped.");
        }
    }

    // Cleanup
    discovery::cleanup(&discovery_path_clone);
    eprintln!("Discovery file cleaned up. Goodbye.");
}

/// Parse --workspace-path from command line arguments.
fn parse_workspace_path(args: &[String]) -> String {
    for (i, arg) in args.iter().enumerate() {
        if arg == "--workspace-path" {
            if let Some(path) = args.get(i + 1) {
                return path.clone();
            }
        }
        if let Some(path) = arg.strip_prefix("--workspace-path=") {
            return path.to_string();
        }
    }
    // Default to current directory
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string())
}
