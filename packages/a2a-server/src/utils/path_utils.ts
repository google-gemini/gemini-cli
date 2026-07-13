/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveToRealPath, isSubpath } from '@google/gemini-cli-core';

/**
 * Validates a workspace path to prevent path traversal attacks.
 *
 * @param workspacePath The path to validate.
 * @param allowedRoot The root directory the path must be within. Defaults to CWD.
 * @returns The resolved, safe path.
 * @throws An error if the path is invalid or outside the allowed root.
 */
export async function validateWorkspacePath(
  workspacePath?: string,
  allowedRoot: string = process.cwd(),
): Promise<string> {
  const trimmedPath = workspacePath?.trim();
  if (!trimmedPath) {
    return resolveToRealPath(allowedRoot);
  }

  if (trimmedPath.includes('\0')) {
    throw new Error('Security violation: Null byte detected in path.');
  }

  try {
    const canonicalAllowedRoot = resolveToRealPath(allowedRoot);
    const resolvedWorkspacePath = path.resolve(
      canonicalAllowedRoot,
      trimmedPath,
    );
    const canonicalWorkspacePath = resolveToRealPath(resolvedWorkspacePath);

    // Check if the resolved path is within the allowed root directory
    if (
      canonicalWorkspacePath !== canonicalAllowedRoot &&
      !isSubpath(canonicalAllowedRoot, canonicalWorkspacePath)
    ) {
      throw new Error(
        `Security violation: The path "${trimmedPath}" is outside the allowed root directory.`,
      );
    }

    const stats = await fs.promises.stat(canonicalWorkspacePath);
    if (!stats.isDirectory()) {
      throw new Error(`The path "${trimmedPath}" is not a directory.`);
    }

    return canonicalWorkspacePath;
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      throw new Error(`The path "${trimmedPath}" does not exist.`);
    }
    throw e; // Re-throw other errors
  }
}
