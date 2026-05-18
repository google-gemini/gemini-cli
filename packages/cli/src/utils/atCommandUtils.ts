/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validatePath, type Config } from '@google/gemini-cli-core';

export interface ResolvedAtCommandPath {
  absolutePath: string;
  relativePath: string;
  stats: {
    isDirectory(): boolean;
    isFile(): boolean;
  };
}

/**
 * Result of a path resolution attempt.
 */
export type ResolveAtCommandPathResult =
  | { status: 'resolved'; resolved: ResolvedAtCommandPath }
  | { status: 'unauthorized'; absolutePath: string; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'not_found' };

/**
 * Resolves a path from an @-command, ensuring it is valid and within workspace boundaries.
 */
export async function resolveAtCommandPath(
  pathName: string,
  config: Config,
  onDebugMessage: (msg: string) => void = () => {},
): Promise<ResolveAtCommandPathResult> {
  const pathValidation = validatePath(pathName);
  if (!pathValidation.isValid) {
    onDebugMessage(
      `Skipping invalid path in @-command: ${pathName}. Reason: ${pathValidation.error}`,
    );
    return { status: 'invalid', error: pathValidation.error! };
  }

  const workspaceDirs = config.getWorkspaceContext().getDirectories();
  let lastUnauthorized: { absolutePath: string; error: string } | null = null;

  for (const dir of workspaceDirs) {
    const absolutePath = path.resolve(dir, pathName);

    // Final workspace boundary check using centralized logic
    const validationError = config.validatePathAccess(absolutePath, 'read');
    if (validationError) {
      onDebugMessage(
        `Skipping unauthorized path: ${absolutePath}. Reason: ${validationError}`,
      );
      // We only care about unauthorized paths if we can't find a valid authorized one.
      // If it's an absolute path, it will be the same absolutePath for all dirs,
      // but validationError might change if one of the dirs actually contains it (and thus makes it authorized).
      lastUnauthorized = { absolutePath, error: validationError };
      continue;
    }

    try {
      const stats = await fs.stat(absolutePath);
      return {
        status: 'resolved',
        resolved: {
          absolutePath,
          relativePath: path.isAbsolute(pathName)
            ? path.relative(dir, absolutePath)
            : pathName,
          stats,
        },
      };
    } catch {
      // Ignore errors for this specific directory, try next
    }
  }

  if (lastUnauthorized) {
    return { status: 'unauthorized', ...lastUnauthorized };
  }

  return { status: 'not_found' };
}
