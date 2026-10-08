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

function canNegationMatchInsideDir(
  dir: string,
  negations: Set<string>,
): boolean {
  const dirPrefix = dir + '/';

  for (const neg of negations) {
    const isAnchored = neg.startsWith('/');
    const cleanNeg = isAnchored ? neg.slice(1) : neg;

    // 1. Exact match with directory (e.g. !dir, !dir/, !/dir, !/dir/)
    if (cleanNeg === dir || cleanNeg === dirPrefix) {
      return true;
    }

    // 2. Concrete path inside the directory (e.g. !dir/keep.txt or !/dir/keep.txt)
    if (cleanNeg.startsWith(dirPrefix)) {
      return true;
    }

    // 3. Unanchored negation: no slash before its final character (e.g. !*.keep, !keep.txt, !dir/)
    const slashIndex = cleanNeg.indexOf('/');
    const isUnanchored =
      !isAnchored && (slashIndex === -1 || slashIndex === cleanNeg.length - 1);
    if (isUnanchored) {
      return true;
    }

    // 4. Wildcard pattern (*, ?, [)
    const firstWildcard = cleanNeg.search(/[*?[]/);
    if (firstWildcard !== -1) {
      const slashBeforeWildcard = cleanNeg.lastIndexOf('/', firstWildcard);
      if (slashBeforeWildcard === -1) {
        // No slash before wildcard (e.g. *.keep, **/keep.txt): can match anywhere
        return true;
      }
      // Fixed prefix before wildcard (e.g. 'packages/' in 'packages/*/keep.txt')
      const prefixBeforeWildcard = cleanNeg.slice(0, slashBeforeWildcard + 1);
      if (
        dirPrefix.startsWith(prefixBeforeWildcard) ||
        prefixBeforeWildcard.startsWith(dirPrefix)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Expands wildcard directory patterns (e.g. 'dir/**') to also include the directory itself ('dir/'),
 * unless there are negative patterns matching or under that directory.
 * This allows directory subtree pruning to identify the directory as ignored.
 */
export function expandWildcardDirectoryPatterns(
  rawPatterns: string[],
  extraRawPatterns?: string[],
): string[] {
  const negations = new Set<string>();
  const allPatternSources = extraRawPatterns
    ? [...rawPatterns, ...extraRawPatterns]
    : rawPatterns;

  for (const p of allPatternSources) {
    const trimmed = p.trim();
    if (trimmed.startsWith('!')) {
      const neg = trimmed.slice(1).trim();
      if (neg !== '') {
        negations.add(neg);
      }
    }
  }

  const expanded: string[] = [];
  for (const p of rawPatterns) {
    expanded.push(p);
    const trimmed = p.trim();

    if (trimmed.startsWith('!') || trimmed.startsWith('#')) {
      continue;
    }
    if (!trimmed.endsWith('/**')) {
      continue;
    }

    const withoutGlob = trimmed.slice(0, -3).replace(/^\//, '');
    // Only expand concrete directory prefixes (skip empty or wildcard-containing paths like '/**' or 'packages/*/**')
    if (
      withoutGlob === '' ||
      withoutGlob.includes('*') ||
      withoutGlob.includes('?')
    ) {
      continue;
    }

    if (!canNegationMatchInsideDir(withoutGlob, negations)) {
      // Convert 'dir/**' or '/dir/**' -> '/dir/' so single-segment patterns stay anchored
      expanded.push(`/${withoutGlob}/`);
    }
  }
  return expanded;
}
