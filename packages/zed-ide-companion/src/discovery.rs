// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

use serde_json::json;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

/// Write the discovery file and return its path.
pub fn write(port: u16, auth_token: &str, workspace_path: &str) -> Result<PathBuf, String> {
    let tmpdir = std::env::var("TMPDIR")
        .or_else(|_| std::env::var("TEMP"))
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "/tmp".to_string());

    let dir = PathBuf::from(&tmpdir).join("gemini").join("ide");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create discovery dir: {}", e))?;

    let pid = std::process::id();
    let filename = format!("gemini-ide-server-{}-{}.json", pid, port);
    let filepath = dir.join(&filename);

    let content = json!({
        "port": port,
        "workspacePath": workspace_path,
        "authToken": auth_token,
        "ideInfo": {
            "name": "zed",
            "displayName": "Zed"
        }
    });

    fs::write(&filepath, content.to_string())
        .map_err(|e| format!("Failed to write discovery file: {}", e))?;

    // Set permissions to 0600
    fs::set_permissions(&filepath, fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("Failed to set permissions: {}", e))?;

    Ok(filepath)
}

/// Remove the discovery file.
pub fn cleanup(path: &PathBuf) {
    let _ = fs::remove_file(path);
}
