/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { GitIgnoreParser } from '@gemini-cli/core';

const GEMINI_IGNORE_FILE_NAME = '.geminiignore';

/**
 * Loads and parses a .geminiignore file from the given workspace root.
 * The .geminiignore file follows a format similar to .gitignore.
 *
 * @param workspaceRoot The absolute path to the workspace root where the .geminiignore file is expected.
 * @returns An array of glob patterns extracted from the .geminiignore file. Returns an empty array
 *          if the file does not exist or contains no valid patterns.
 */
export async function loadGeminiIgnorePatterns(
  workspaceRoot: string,
): Promise<string[]> {
  const parser = new GitIgnoreParser(workspaceRoot);

  try {
    await parser.loadPatterns(GEMINI_IGNORE_FILE_NAME);
  } catch (error: unknown) {
    const ignoreFilePath = path.join(workspaceRoot, GEMINI_IGNORE_FILE_NAME);
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
  const loadedPatterns = parser.getPatterns();
  if (loadedPatterns.length > 0) {
    console.log(
      `[INFO] Loaded ${loadedPatterns.length} patterns from .geminiignore`,
    );
  }
  return loadedPatterns;
}
