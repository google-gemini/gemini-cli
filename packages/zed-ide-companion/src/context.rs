// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

//! Context tracking for the Zed IDE companion.
//!
//! **Known limitation**: Zed does not expose open files, cursor position, or
//! selection state to external processes. This module provides only the
//! workspace path. Open file tracking will require future Zed API support.

use serde_json::{json, Value};

/// Build the current context as a JSON value.
///
/// Since Zed doesn't expose editor state to external processes, this returns
/// an empty openFiles array with only the workspace trust status.
pub fn get_context(workspace_path: &str) -> Value {
    json!({
        "workspaceState": {
            "openFiles": [],
            "isTrusted": true
        }
    })
}
