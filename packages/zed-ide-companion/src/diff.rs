// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

//! Diff management for the Zed IDE companion.
//!
//! **Known limitation**: Zed does not expose a programmatic diff view API to
//! external processes. This module stores proposed content in memory and returns
//! it on `closeDiff`. Users accept/reject diffs from the CLI side.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Diff content store.
pub type DiffStore = Arc<RwLock<HashMap<String, String>>>;

/// Create a new diff store.
pub fn new_store() -> DiffStore {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Store proposed content for a file.
pub async fn open_diff(store: &DiffStore, file_path: &str, new_content: &str) {
    let mut map = store.write().await;
    map.insert(file_path.to_string(), new_content.to_string());
}

/// Retrieve and remove proposed content for a file.
pub async fn close_diff(store: &DiffStore, file_path: &str) -> Option<String> {
    let mut map = store.write().await;
    map.remove(file_path)
}
