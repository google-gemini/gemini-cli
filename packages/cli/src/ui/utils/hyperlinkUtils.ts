/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

// OSC 8 hyperlink escape sequences
const OSC8_START = '\x1b]8;;';
const OSC8_END = '\x07';

/**
 * Wraps text with OSC 8 terminal hyperlink escape sequences.
 * Terminals that support OSC 8 will render the text as a clickable link.
 * Unsupported terminals will simply display the text as-is (graceful degradation).
 */
export function wrapHyperlink(text: string, uri: string): string {
  return `${OSC8_START}${uri}${OSC8_END}${text}${OSC8_START}${OSC8_END}`;
}

/**
 * Checks if a string looks like a file path.
 * Used primarily for inline code content to decide if it should be hyperlinked.
 */
export function looksLikeFilePath(text: string): boolean {
  // Strip optional :line:col suffix
  const withoutSuffix = text.replace(/:\d+(?::\d+)?$/, '');
  // Must contain a path separator
  if (!withoutSuffix.includes('/') && !withoutSuffix.includes('\\')) {
    return false;
  }
  // Must not look like a URL
  if (/^[a-z]+:\/\//i.test(withoutSuffix)) return false;
  // Must not contain whitespace
  if (/\s/.test(withoutSuffix)) return false;
  // Must start with something path-like
  return /^(?:\.{0,2}\/|[A-Za-z]:[/\\]|[-\w.@]+\/)/.test(withoutSuffix);
}

/**
 * Extracts the file path portion from a string, removing any :line:col suffix.
 */
export function extractFilePath(text: string): string {
  return text.replace(/:\d+(?::\d+)?$/, '');
}

/**
 * Regex to detect file paths in plain text segments.
 *
 * Matches:
 * - Absolute Unix paths: /path/to/file.ts (at least 2 segments)
 * - Relative paths: ./file.ts, ../file.ts, ./dir/file.ts
 * - Bare relative paths: src/file.ts, dir/subdir/file.ts (at least one /)
 * - Windows absolute paths: C:\path\to\file.ts or C:/path/to/file.ts
 * - Optional :line or :line:col suffix
 */
export const PLAIN_TEXT_FILE_PATH_REGEX = new RegExp(
  // Alternation of path types:
  '(' +
    // Absolute Unix path (at least 2 segments)
    '\\/[-\\w.@]+(?:\\/[-\\w.@]+)+' +
    // Relative path with ./ or ../ prefix
    '|\\.\\.?\\/[-\\w.@]+(?:\\/[-\\w.@]+)*' +
    // Windows absolute path
    '|[A-Za-z]:[/\\][-\w.@]+(?:[/\\][-\w.@]+)*' +
    // Bare relative path (at least one /)
    '|[-\\w.@]+\\/[-\\w.@]+(?:\\/[-\\w.@]+)*' +
    ')' +
    // Optional :line:col suffix
    '(?::(\\d+)(?::(\\d+))?)?',
  'g',
);

/**
 * Resolves a file path to a file:// URI.
 * Relative paths are resolved against cwd.
 */
export function resolveFileUri(
  filePath: string,
  line?: string,
  col?: string,
  cwd: string = process.cwd(),
): string {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(cwd, filePath);
  let uri = pathToFileURL(resolved).toString();
  if (line) {
    uri += "#L" + line;
    if (col) uri += "," + col;
  }
  return uri;
}
