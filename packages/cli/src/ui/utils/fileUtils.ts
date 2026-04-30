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
