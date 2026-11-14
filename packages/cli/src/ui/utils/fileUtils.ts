/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';

/**
 * Gets the file extension from a filename or path, excluding the leading dot.
 * Returns null if no extension is found.
 */
export function getFileExtension(
  filename: string | null | undefined,
): string | null {
  if (!filename) return null;
  const ext = path.extname(filename);
  return ext ? ext.slice(1) : null;
}

/**
 * Checks if a filename corresponds to a package lock or dependency resolution file.
 */
export function isLockFile(filename: string | null | undefined): boolean {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('-lock.json') ||
    lower.endsWith('.lock') ||
    lower.endsWith('.lockb') ||
    lower === 'pnpm-lock.yaml' ||
    lower === 'go.sum'
  );
}
