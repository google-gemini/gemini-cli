/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const GEMINI_CLI_COMPANION_EXTENSION_NAME = 'Gemini CLI Companion';
export const IDE_MAX_OPEN_FILES = 10;
export const IDE_MAX_SELECTED_TEXT_LENGTH = 16384; // 16 KiB limit
export const IDE_REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Upper bound on how long IdeClient.getInstance() will wait for the process
// tree traversal (getIdeProcessInfo) before falling back to a no-IDE client.
// On a bare terminal a specific ancestor PID can make `ps` hang indefinitely,
// which blocks BuiltinCommandLoader and leaves the TUI stuck on
// "Initializing..." forever. See #21477.
export const IDE_PROCESS_INFO_TIMEOUT_MS = 3 * 1000; // 3 seconds
