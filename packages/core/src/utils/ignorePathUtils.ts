/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';

/**
 * Normalizes a file path to be relative to the project root and formatted for the 'ignore' library.
 *
 * @returns The normalized relative path, or null if the path is invalid or outside the root.
 */
export function getNormalizedRelativePath(
  projectRoot: string,
  filePath: string,
  isDirectory: boolean,
): string | null {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  const absoluteFilePath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, absoluteFilePath);

  // Ensure the path is within the project root
  if (relativePath.startsWith(`..${path.sep}`) || relativePath === '..') {
    return null;
  }

  // Convert Windows backslashes to forward slashes for the 'ignore' library
  let normalized = relativePath.replace(/\\/g, '/');

  // Preserve trailing slash to ensure directory patterns (e.g., 'dist/') match correctly
  if (isDirectory && !normalized.endsWith('/') && normalized !== '') {
    normalized += '/';
  }

  // Handle the project root directory
  if (normalized === '') {
    return isDirectory ? '/' : '';
  }

  // Ensure relative paths don't start with a slash unless it represents the root
  if (normalized.startsWith('/') && normalized !== '/') {
    normalized = normalized.substring(1);
  }

  return normalized;
}
