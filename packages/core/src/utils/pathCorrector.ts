/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { bfsFileSearchSync } from './bfsFileSearch.js';

type SuccessfulPathCorrection = {
  success: true;
  correctedPath: string;
};

type FailedPathCorrection = {
  success: false;
  error: string;
};

/**
 * Attempts to correct a relative or ambiguous file path to a single, absolute path
 * within the workspace.
 *
 * @param filePath The file path to correct.
 * @param config The application configuration.
 * @returns A `PathCorrectionResult` object with either a `correctedPath` or an `error`.
 */
export type PathCorrectionResult =
  | SuccessfulPathCorrection
  | FailedPathCorrection;
export function correctPath(
  filePath: string,
  config: Config,
): PathCorrectionResult {
  // Check for direct path relative to the primary target directory.
  const directPath = path.join(config.getTargetDir(), filePath);
  if (fs.existsSync(directPath)) {
    return { success: true, correctedPath: directPath };
  }

  // If not found directly, search across all workspace directories for ambiguous matches.
  const workspaceContext = config.getWorkspaceContext();
  const searchPaths = workspaceContext.getDirectories();
  const basename = path.basename(filePath);
  const normalizedTarget = filePath.replace(/\\/g, '/');

  // Normalize path for matching and check if it ends with the provided relative path
  const foundFiles = searchPaths
    .flatMap((searchPath) =>
      bfsFileSearchSync(searchPath, {
        fileName: basename,
        maxDirs: 50, // Capped to avoid deep hangs
        fileService: config.getFileService(),
        fileFilteringOptions: config.getFileFilteringOptions(),
      }),
    )
    .filter((f) => f.replace(/\\/g, '/').endsWith(normalizedTarget));

  if (foundFiles.length === 0) {
    return {
      success: false,
      error: `File not found for '${filePath}' and path is not absolute.`,
    };
  }

  if (foundFiles.length > 1) {
    return {
      success: false,
      error: `The file path '${filePath}' is ambiguous and matches multiple files. Please provide a more specific path. Matches: ${foundFiles.join(', ')}`,
    };
  }

  return { success: true, correctedPath: foundFiles[0] };
}
