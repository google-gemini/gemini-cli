/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';
import { resolvePath } from './resolvePath.js';

/**
 * Resolves, normalizes, and validates a workspace path.
 *
 * 1. Expands ~ and %userprofile% via resolvePath.
 * 2. Ensures the path is absolute via path.resolve.
 * 3. Validates that the path exists and is a directory.
 */
export function bootstrapWorkspace(workspaceArg: string): string {
  const expandedPath = resolvePath(workspaceArg);
  const resolvedPath = path.resolve(expandedPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Workspace path "${resolvedPath}" does not exist.`);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Workspace path "${resolvedPath}" is not a directory.`);
  }

  return resolvedPath;
}
