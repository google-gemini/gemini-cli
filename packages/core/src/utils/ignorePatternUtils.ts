/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks whether a gitignore pattern contains a "content slash" — a slash
 * that anchors the pattern to a specific directory, as opposed to a trailing
 * slash that only restricts the match to directories.
 *
 * Per gitignore(5):
 *   "If there is a separator at the beginning or middle (or both) of the
 *    pattern, then the pattern is relative to the directory level of the
 *    particular .gitignore file itself."
 *   "A trailing '/' matches only directories."
 *
 * Examples:
 *   - `build/`       → false (trailing slash only → matches at any depth)
 *   - `build`        → false (no slash at all     → matches at any depth)
 *   - `src/build`    → true  (slash in middle     → anchored)
 *   - `src/build/`   → true  (slash in middle     → anchored)
 *   - `a/b/c`        → true  (slashes in middle   → anchored)
 *
 * The leading-slash anchor (`/build`) is handled separately by the caller
 * before this function is reached, so it is not considered here.
 */
export function hasContentSlash(pattern: string): boolean {
  // Strip a single trailing slash if present, then check for any remaining
  // slash.  This correctly handles all cases:
  //   'build/'     → 'build'     → no slash → false
  //   'build'      → 'build'     → no slash → false
  //   'src/build'  → 'src/build' → has '/'  → true
  //   'src/build/' → 'src/build' → has '/'  → true
  //   'a/b/'       → 'a/b'       → has '/'  → true
  const stripped = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
  return stripped.includes('/');
}

/**
 * Returns true if the pattern is directory-only (has a trailing slash).
 *
 * Per gitignore(5), a trailing slash means the pattern should only match
 * directories.  This is orthogonal to anchoring.
 */
export function isDirectoryOnlyPattern(pattern: string): boolean {
  return pattern.endsWith('/');
}
