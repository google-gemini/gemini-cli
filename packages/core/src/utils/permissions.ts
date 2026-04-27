/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * POSIX mode bits for sensitive directories under `~/.gemini/`. Restricts
 * read/write/execute to the owning user only — same posture as `FileKeychain`
 * (`packages/core/src/services/fileKeychain.ts:66`).
 *
 * Used for chats, logs, tool-output, memory, tracker, plans, history, and
 * other generated state that may contain user prompts, model output, source
 * code snapshots, or session identifiers.
 */
export const SECURE_DIR_MODE = 0o700;

/**
 * POSIX mode bits for sensitive files under `~/.gemini/`. Restricts read/write
 * to the owning user only — same posture as `FileKeychain`
 * (`packages/core/src/services/fileKeychain.ts:102`).
 */
export const SECURE_FILE_MODE = 0o600;
