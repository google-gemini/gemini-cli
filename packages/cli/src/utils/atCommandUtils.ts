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
 * Resolves a path from an @-command, ensuring it is valid and within workspace boundaries.
 */
export async function resolveAtCommandPath(
  pathName: string,
  config: Config,
  onDebugMessage: (msg: string) => void = () => {},
): Promise<ResolvedAtCommandPath | null> {
  const pathValidation = validatePath(pathName);
  if (!pathValidation.isValid) {
    onDebugMessage(
      `Skipping invalid path in @-command: ${pathName}. Reason: ${pathValidation.error}`,
    );
    return null;
  }

  for (const dir of config.getWorkspaceContext().getDirectories()) {
    try {
      const absolutePath = path.resolve(dir, pathName);

      const resolvedValidation = validatePath(absolutePath);
      if (!resolvedValidation.isValid) {
        onDebugMessage(
          `Skipping invalid resolved path in @-command: ${absolutePath}. Reason: ${resolvedValidation.error}`,
        );
        continue;
      }

      // Final workspace boundary check using centralized logic
      const validationError = config.validatePathAccess(absolutePath, 'read');
      if (validationError) {
        onDebugMessage(
          `Skipping unauthorized path: ${absolutePath}. Reason: ${validationError}`,
        );
        continue;
      }

      const stats = await fs.stat(absolutePath);
      const relativePath = path.isAbsolute(pathName)
        ? path.relative(dir, absolutePath)
        : pathName;

      return {
        absolutePath,
        relativePath,
        stats,
      };
    } catch {
      // Ignore errors for this specific directory, try next
    }
  }

  return null;
}
