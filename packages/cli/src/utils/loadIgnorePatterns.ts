/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const GEMINI_IGNORE_FILE_NAME = '.geminiignore';

/**
 * Loads and parses a .geminiignore file from the given workspace root.
 * The .geminiignore file follows a format similar to .gitignore:
 * - Each line specifies a glob pattern.
 * - Lines are trimmed of leading and trailing whitespace.
 * - Blank lines (after trimming) are ignored.
 * - Lines starting with a pound sign (#) (after trimming) are treated as comments and ignored.
 * - Patterns are case-sensitive and follow standard glob syntax.
 * - If a # character appears elsewhere in a line (not at the start after trimming),
 *   it is considered part of the glob pattern.
 *
 * @param workspaceRoot The absolute path to the workspace root where the .geminiignore file is expected.
 * @returns An array of glob patterns extracted from the .geminiignore file. Returns an empty array
 *          if the file does not exist or contains no valid patterns.
 */
export function loadGeminiIgnorePatterns(workspaceRoot: string): string[] {
  const ignoreFilePath = path.join(workspaceRoot, GEMINI_IGNORE_FILE_NAME);
  const patterns: string[] = [];

  try {
    const fileContent = fs.readFileSync(ignoreFilePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        patterns.push(trimmedLine);
      }
    }
    if (patterns.length > 0) {
      console.log(
        `[INFO] Loaded ${patterns.length} patterns from .geminiignore`,
      );
    }
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      if (error.code === 'ENOENT') {
        // .geminiignore not found, which is fine.
      } else {
        // Other error reading the file (e.g., permissions)
        console.warn(
          `[WARN] Could not read .geminiignore file at ${ignoreFilePath}: ${error.message}`,
        );
      }
    } else {
      // For other types of errors, or if code is not available
      console.warn(
        `[WARN] An unexpected error occurred while trying to read ${ignoreFilePath}: ${String(error)}`,
      );
    }
  }
  return patterns;
}
