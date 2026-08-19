/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Result of a path validation check.
 */
export interface PathValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Common path limits.
 * While some OSs support longer, 4096 is a safe cross-platform limit for absolute paths.
 * Individual components are usually limited to 255.
 */
const MAX_PATH_LENGTH = 4096;
const MAX_COMPONENT_LENGTH = 255;

/**
 * Validates a path string for common issues that lead to system-level crashes (like ENAMETOOLONG).
 * This is intended as a "pre-flight" check for paths derived from untrusted model output.
 */
export function validatePath(pathStr: string): PathValidationResult {
  if (!pathStr || typeof pathStr !== 'string') {
    return { isValid: false, error: 'Path must be a non-empty string.' };
  }

  // Check for obviously invalid characters (newlines, control characters, null bytes)
  // These often appear when the model misinterprets logs as paths.
  if (/[\n\r\0\t]/.test(pathStr)) {
    return {
      isValid: false,
      error:
        'Path contains invalid characters (newlines or control characters).',
    };
  }

  // Check for common log/error patterns that are definitely not paths.
  // We check for these at the start of the string OR at the start of any path component.
  // This ensures we catch them in both raw model output and resolved absolute paths.
  const logMarkerRegexes = [
    /(^|[/\\])AssertionError:/,
    /(^|[/\\])FAIL /,
    /(^|[/\\])✓ /,
    /(^|[/\\])× /,
    /(^|[/\\])TestingLibraryElementError:/,
  ];
  for (const regex of logMarkerRegexes) {
    if (regex.test(pathStr)) {
      return {
        isValid: false,
        error: 'Path appears to be a misinterpreted log fragment.',
      };
    }
  }

  // Check for double quotes or ellipses in "paths" - almost always a misinterpretation if not a very short name.
  // We removed single quotes from this list to support users with apostrophes in their home directories.
  if (pathStr.includes('"') || pathStr.includes('...')) {
    if (pathStr.length > 20) {
      return {
        isValid: false,
        error:
          'Path contains suspicious characters (double quotes or ellipses) and is too long to be a simple filename.',
      };
    }
  }

  // Check total length
  if (pathStr.length > MAX_PATH_LENGTH) {
    return {
      isValid: false,
      error: `Path is too long (maximum ${MAX_PATH_LENGTH} characters).`,
    };
  }

  // Check individual component lengths
  const components = pathStr.split(/[/\\]/);
  for (const component of components) {
    if (component.length > MAX_COMPONENT_LENGTH) {
      return {
        isValid: false,
        error: `Path component "${component.substring(0, 20)}..." is too long (maximum ${MAX_COMPONENT_LENGTH} characters).`,
      };
    }
  }

  return { isValid: true };
}
