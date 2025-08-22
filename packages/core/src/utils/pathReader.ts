/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { WorkspaceContext } from './workspaceContext.js';

/**
 * Reads the content of a file or a formatted listing of a directory from
 * within the workspace.
 *
 * @param pathStr The path to read (can be absolute or relative).
 * @param workspace The WorkspaceContext containing all allowed directories.
 * @returns A promise that resolves to the file content or directory listing.
 * @throws An error if the path is not found or is outside the workspace.
 */
export async function readPathFromWorkspace(
  pathStr: string,
  workspace: WorkspaceContext,
): Promise<string> {
  let absolutePath: string | null = null;

  if (path.isAbsolute(pathStr)) {
    if (!workspace.isPathWithinWorkspace(pathStr)) {
      throw new Error(
        `Absolute path is outside of the allowed workspace: ${pathStr}`,
      );
    }
    absolutePath = pathStr;
  } else {
    // Prioritized search for relative paths.
    const searchDirs = workspace.getDirectories();
    for (const dir of searchDirs) {
      const potentialPath = path.resolve(dir, pathStr);
      try {
        await fs.access(potentialPath);
        absolutePath = potentialPath;
        break; // Found the first match.
      } catch {
        // Not found, continue to the next directory.
      }
    }
  }

  if (!absolutePath) {
    throw new Error(`Path not found in workspace: ${pathStr}`);
  }

  const stats = await fs.stat(absolutePath);
  if (stats.isDirectory()) {
    const entries = await fs.readdir(absolutePath);
    return `Directory listing for ${pathStr}:\n- ${entries.join('\n- ')}`;
  } else {
    return fs.readFile(absolutePath, 'utf-8');
  }
}
