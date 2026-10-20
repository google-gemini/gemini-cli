/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { ideContextStore } from '../ide/ideContext.js';
import { bfsFileSearchSync } from './bfsFileSearch.js';
import {
  isSubpath,
  resolveDefensiveToolPath,
  resolveToRealPath,
} from './paths.js';

type SuccessfulPathCorrection = {
  success: true;
  correctedPath: string;
};

type FailedPathCorrection = {
  success: false;
  error: string;
};

/**
 * Resolves the effective workspace target directory for relative tool paths.
 *
 * When IDE mode is active and the user has an open/active file in `ideContextStore`,
 * this selects the workspace directory (or nested Git repository root within a
 * parent workspace directory) containing that active file so relative paths are
 * resolved against the project the user is actively working on in the IDE.
 */
export function resolveActiveWorkspaceDir(
  config: Config,
  relativeFilePath?: string,
): string {
  const defaultTargetDir = config.getTargetDir();
  if (typeof config.getIdeMode !== 'function' || !config.getIdeMode()) {
    return defaultTargetDir;
  }

  const ideContext = ideContextStore.get();
  const openFiles = ideContext?.workspaceState?.openFiles;
  const activeFile = openFiles?.find((file) => file.isActive) ?? openFiles?.[0];
  if (!activeFile?.path) {
    return defaultTargetDir;
  }

  const workspaceContext =
    typeof config.getWorkspaceContext === 'function'
      ? config.getWorkspaceContext()
      : undefined;
  if (!workspaceContext) {
    return defaultTargetDir;
  }

  const resolvedActiveFilePath = resolveToRealPath(activeFile.path);
  const matchingWorkspaceDirs = workspaceContext
    .getDirectories()
    .map((dir) => resolveToRealPath(dir))
    .filter((dir) => isSubpath(dir, resolvedActiveFilePath))
    .sort((a, b) => b.length - a.length);

  if (matchingWorkspaceDirs.length === 0) {
    return defaultTargetDir;
  }

  let activeWorkspaceDir = matchingWorkspaceDirs[0];

  // If the matching workspace root is a parent folder containing multiple nested
  // Git repositories, narrow to the nested repository root containing activeFile.
  let currentDir = path.dirname(resolvedActiveFilePath);
  while (
    currentDir !== activeWorkspaceDir &&
    isSubpath(activeWorkspaceDir, currentDir)
  ) {
    try {
      if (fs.existsSync(path.join(currentDir, '.git'))) {
        activeWorkspaceDir = currentDir;
        break;
      }
    } catch {
      // Ignore filesystem errors while probing for nested .git boundaries
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  const resolvedDefaultTargetDir = resolveToRealPath(defaultTargetDir);
  if (
    relativeFilePath &&
    !path.isAbsolute(relativeFilePath) &&
    activeWorkspaceDir !== resolvedDefaultTargetDir &&
    isSubpath(resolvedDefaultTargetDir, activeWorkspaceDir)
  ) {
    const relToDefault = path
      .relative(resolvedDefaultTargetDir, activeWorkspaceDir)
      .replace(/\\/g, '/');
    const normalizedInput = relativeFilePath
      .replace(/^@[/\\]?/, '')
      .replace(/\\/g, '/');
    if (
      relToDefault &&
      (normalizedInput === relToDefault ||
        normalizedInput.startsWith(`${relToDefault}/`))
    ) {
      return resolvedDefaultTargetDir;
    }
  }

  return activeWorkspaceDir;
}

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
  const targetDir = resolveToRealPath(
    resolveActiveWorkspaceDir(config, filePath),
  );
  const sanitizedPath = resolveDefensiveToolPath(filePath, targetDir);

  // Check for direct path relative to the active target directory.
  const directPath = resolveToRealPath(path.join(targetDir, sanitizedPath));
  if (fs.existsSync(directPath)) {
    return { success: true, correctedPath: directPath };
  }

  const fallbackTargetDir = resolveToRealPath(config.getTargetDir());
  if (targetDir !== fallbackTargetDir) {
    const fallbackDirectPath = resolveToRealPath(
      path.join(fallbackTargetDir, sanitizedPath),
    );
    if (fs.existsSync(fallbackDirectPath)) {
      return { success: true, correctedPath: fallbackDirectPath };
    }
  }

  // If not found directly, search across workspace directories for ambiguous matches.
  const workspaceContext = config.getWorkspaceContext();
  const searchPaths = workspaceContext.getDirectories();
  const basename = path.basename(sanitizedPath);
  const normalizedTarget = sanitizedPath.replace(/\\/g, '/');

  if (targetDir !== fallbackTargetDir) {
    const activeFoundFiles = bfsFileSearchSync(targetDir, {
      fileName: basename,
      maxDirs: 50,
      fileService: config.getFileService(),
      fileFilteringOptions: config.getFileFilteringOptions(),
    }).filter((f) => f.replace(/\\/g, '/').endsWith(normalizedTarget));

    if (activeFoundFiles.length === 1) {
      return { success: true, correctedPath: activeFoundFiles[0] };
    }
  }

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
