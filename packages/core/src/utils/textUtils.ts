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

  // This regex matches a "Grapheme Cluster" manually:
  // 1. A surrogate pair OR a single character...
  // 2. Followed by any number of "Combining Marks" (\p{M})
  // 'u' flag is required for Unicode property escapes
  const graphemeRegex = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|.)\p{M}*/gu;

  let truncatedStr = '';
  let match: RegExpExecArray | null;

  while ((match = graphemeRegex.exec(str)) !== null) {
    const segment = match[0];

    // If adding the whole cluster (base char + accent) exceeds maxLength, stop.
    if (truncatedStr.length + segment.length > maxLength) {
      break;
    }

    truncatedStr += segment;
    if (truncatedStr.length >= maxLength) break;
  }

  // Final safety check for dangling high surrogates
  if (truncatedStr.length > 0) {
    const lastCode = truncatedStr.charCodeAt(truncatedStr.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      truncatedStr = truncatedStr.slice(0, -1);
    }
  }

  return truncatedStr + suffix;
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

/**
 * Sanitizes output for injection into the model conversation.
 * Wraps output in a secure <output> tag and handles potential injection vectors
 * (like closing tags or template patterns) within the data.
 * @param output The raw output to sanitize.
 * @returns The sanitized string ready for injection.
 */
export function sanitizeOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return '';
  }

  // Prevent direct closing tag injection.
  const escaped = trimmed.replaceAll('</output>', '&lt;/output&gt;');
  return `<output>\n${escaped}\n</output>`;
}
