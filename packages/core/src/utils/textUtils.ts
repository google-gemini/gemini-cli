/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely replaces text with literal strings, avoiding ECMAScript GetSubstitution issues.
 * Escapes $ characters to prevent template interpretation.
 */
export function safeLiteralReplace(
  str: string,
  oldString: string,
  newString: string,
): string {
  if (oldString === '' || !str.includes(oldString)) {
    return str;
  }

  if (!newString.includes('$')) {
    return str.replaceAll(oldString, newString);
  }

  const escapedNewString = newString.replaceAll('$', '$$$$');
  return str.replaceAll(oldString, escapedNewString);
}

/**
 * Checks if a Buffer is likely binary by testing for the presence of a NULL byte.
 * The presence of a NULL byte is a strong indicator that the data is not plain text.
 * @param data The Buffer to check.
 * @param sampleSize The number of bytes from the start of the buffer to test.
 * @returns True if a NULL byte is found, false otherwise.
 */
export function isBinary(
  data: Buffer | null | undefined,
  sampleSize = 512,
): boolean {
  if (!data) {
    return false;
  }

  const sample = data.length > sampleSize ? data.subarray(0, sampleSize) : data;

  for (const byte of sample) {
    // The presence of a NULL byte (0x00) is one of the most reliable
    // indicators of a binary file. Text files should not contain them.
    if (byte === 0) {
      return true;
    }
  }

  // If no NULL bytes were found in the sample, we assume it's text.
  return false;
}

/**
 * Detects the line ending style of a string.
 * @param content The string content to analyze.
 * @returns '\r\n' for Windows-style, '\n' for Unix-style.
 */
export function detectLineEnding(content: string): '\r\n' | '\n' {
  // If a Carriage Return is found, assume Windows-style endings.
  // This is a simple but effective heuristic.
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Truncates a string to a maximum length, appending a suffix if truncated.
 * @param str The string to truncate.
 * @param maxLength The maximum length of the string.
 * @param suffix The suffix to append if truncated (default: '...[TRUNCATED]').
 * @returns The truncated string.
 */
export function truncateString(
  str: string,
  maxLength: number,
  suffix = '...[TRUNCATED]',
): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + suffix;
}

/**
 * Options for line truncation.
 */
export interface TruncateLineOptions {
  maxLength: number;
  centerIndex?: number;
  includeStats?: boolean;
}

/**
 * Truncates a single line, optionally centering around a specific index.
 */
export function truncateLine(
  line: string,
  options: TruncateLineOptions,
): string {
  const { maxLength, centerIndex, includeStats } = options;
  const originalLength = line.length;

  if (originalLength <= maxLength) {
    return line;
  }

  let truncated: string;
  let start = 0;
  let end = maxLength;

  if (centerIndex !== undefined) {
    const halfLength = Math.floor(maxLength / 2);
    start = Math.max(0, centerIndex - halfLength);
    end = start + maxLength;

    if (end > originalLength) {
      end = originalLength;
      start = Math.max(0, end - maxLength);
    }

    const prefix = start > 0 ? '... ' : '';
    const suffix = end < originalLength ? ' ...' : '';
    truncated = prefix + line.substring(start, end) + suffix;
  } else {
    truncated = line.substring(0, maxLength) + ' ...';
  }

  if (includeStats) {
    const stats =
      centerIndex !== undefined
        ? `[Truncated: showing characters ${start} to ${end} of ${originalLength}]`
        : `[Truncated to ${maxLength} characters (total length: ${originalLength})]`;

    if (centerIndex !== undefined) {
      // For centered, we put stats at both ends if they are truncated
      const prefix = start > 0 ? `${stats} ... ` : '';
      const suffix = end < originalLength ? ` ... ${stats}` : '';
      truncated = prefix + line.substring(start, end) + suffix;
    } else {
      truncated = line.substring(0, maxLength) + ` ${stats}`;
    }
  }

  return truncated;
}

/**
 * Truncates all lines in a string that exceed the maximum length.
 */
export function truncateLongLines(
  text: string,
  maxLength: number,
  includeStats = true,
): string {
  if (!text) return text;
  const lines = text.split('\n');
  let modified = false;

  const processed = lines.map((line) => {
    if (line.length > maxLength) {
      modified = true;
      return truncateLine(line, { maxLength, includeStats });
    }
    return line;
  });

  return modified ? processed.join('\n') : text;
}

/**
 * Safely replaces placeholders in a template string with values from a replacements object.
 * This performs a single-pass replacement to prevent double-interpolation attacks.
 *
 * @param template The template string containing {{key}} placeholders.
 * @param replacements A record of keys to their replacement values.
 * @returns The resulting string with placeholders replaced.
 */
export function safeTemplateReplace(
  template: string,
  replacements: Record<string, string>,
): string {
  // Regex to match {{key}} in the template string. The regex enforces string naming rules.
  const placeHolderRegex = /\{\{(\w+)\}\}/g;
  return template.replace(placeHolderRegex, (match, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key)
      ? replacements[key]
      : match,
  );
}
