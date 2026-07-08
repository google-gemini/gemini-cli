/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectIdeFromEnv } from '../ide/detect-ide.js';

/** Default surface value when no IDE/environment is detected. */
export const SURFACE_NOT_SET = 'terminal';

/**
 * Determines the surface/distribution channel the CLI is running in.
 *
 * Priority:
 * 1. `GEMINI_CLI_SURFACE` env var (first-class override for enterprise customers)
 * 2. `SURFACE` env var (legacy override, kept for backward compatibility)
 * 3. Auto-detection via environment variables (Cloud Shell, GitHub Actions, IDE, etc.)
 *
 * @returns A human-readable surface identifier (e.g., "vscode", "cursor", "terminal").
 */
export function determineSurface(): string {
  // Priority 1 & 2: Explicit overrides from environment variables.
  const customSurface =
    process.env['GEMINI_CLI_SURFACE'] || process.env['SURFACE'];
  if (customSurface) {
    return customSurface;
  }

  // Priority 3: Auto-detect IDE/environment.
  const ide = detectIdeFromEnv();

  // `detectIdeFromEnv` falls back to 'vscode' for generic terminals.
  // If a specific IDE (e.g., Cloud Shell, Cursor, JetBrains) was detected,
  // its name will be something other than 'vscode', and we can use it directly.
  if (ide.name !== 'vscode') {
    return ide.name;
  }

  // If the detected IDE is 'vscode', we only accept it if TERM_PROGRAM or VSCODE_PID confirms it.
  // This prevents generic terminals from being misidentified as VSCode, while still detecting
  // background processes spawned by the VS Code extension host (like a2a-server).
  if (process.env['TERM_PROGRAM'] === 'vscode' || process.env['VSCODE_PID']) {
    return ide.name;
  }

  // Priority 4: GitHub Actions (checked after IDE detection so that
  // specific environments like Cloud Shell take precedence).
  if (process.env['GITHUB_SHA']) {
    return 'GitHub';
  }

  // Priority 5: Fallback for all other cases (e.g., a generic terminal).
  return SURFACE_NOT_SET;
}
