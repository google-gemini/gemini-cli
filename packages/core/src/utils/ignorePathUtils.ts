/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { isWithinRoot, canonicalizeMacosPath } from './fileUtils.js';
import { resolveToRealPath } from './paths.js';

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

  // Ensure the path is within the project root
  if (!isWithinRoot(absoluteFilePath, projectRoot)) {
    return null;
  }

  const canonicalRoot = canonicalizeMacosPath(projectRoot);
  const canonicalAbs = canonicalizeMacosPath(absoluteFilePath);

  let relativePath = path.relative(canonicalRoot, canonicalAbs);

  // Handle cross-platform root prefix discrepancies (e.g., macOS /var vs /private/var)
  if (process.platform === 'darwin' && relativePath.startsWith('..')) {
    try {
      const crossPlatformRel = path.relative(
        resolveToRealPath(projectRoot),
        resolveToRealPath(absoluteFilePath),
      );
      if (!crossPlatformRel.startsWith('..')) {
        relativePath = crossPlatformRel;
      }
    } catch {
      // Fallback to original relativePath
    }
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

/**
 * Expands wildcard directory patterns (e.g. 'dir/**') to also include the directory itself ('dir/'),
 * unless there are negative patterns under that directory.
 * This allows directory subtree pruning to identify the directory as ignored.
 */
export function expandWildcardDirectoryPatterns(
  rawPatterns: string[],
): string[] {
  const negations = new Set<string>();
  for (const p of rawPatterns) {
    const trimmed = p.trimStart();
    if (trimmed.startsWith('!')) {
      negations.add(trimmed.slice(1).replace(/^\//, ''));
    }
  }

  const expanded: string[] = [];
  for (const p of rawPatterns) {
    expanded.push(p);
    const trimmed = p.trim();
    if (
      !trimmed.startsWith('!') &&
      !trimmed.startsWith('#') &&
      trimmed.endsWith('/**')
    ) {
      const withoutGlob = trimmed.slice(0, -3).replace(/^\//, '');
      if (withoutGlob !== '') {
        const hasNegation = Array.from(negations).some((neg) =>
          neg.startsWith(withoutGlob + '/'),
        );
        if (!hasNegation) {
          expanded.push(trimmed.slice(0, -2));
        }
      }
    }
  }
  return expanded;
}
