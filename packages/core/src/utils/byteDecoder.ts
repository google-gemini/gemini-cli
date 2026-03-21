/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detects if a string looks like comma-separated byte values (e.g. from a
 * Uint8Array that was coerced to string via its default toString()) and
 * decodes it to readable UTF-8 text.
 *
 * The message may have a prefix (e.g., "got status: 429 Too Many Requests. ")
 * followed by the byte-coded body.
 *
 * Example input:  "91,123,10,32,32,34,101,114,114,111,114,34,58,32,123,10"
 * Example output: '[{\n  "error": {\n'
 */
export function decodeByteCodedString(value: string): string {
  if (!value || !value.includes(',')) {
    return value;
  }

  // Try the entire string as byte codes first.
  const decoded = tryDecodeBytes(value);
  if (decoded !== null) {
    return decoded;
  }

  // If the whole string isn't bytes, it might have a prefix. Try to find
  // a byte-like sequence at the end of the string.
  // Allow optional whitespace after commas to handle edge cases.
  const match = value.match(/((?:\d{1,3},\s*)+\d{1,3})$/);
  if (match) {
    const byteString = match[1];
    const decodedRest = tryDecodeBytes(byteString);
    if (decodedRest !== null) {
      const prefix = value.substring(0, value.length - byteString.length);
      return prefix + decodedRest;
    }
  }

  return value;
}

/**
 * Attempts to decode a string of comma-separated byte values into UTF-8 text.
 * Returns the decoded string, or null if the input doesn't look like byte codes.
 */
function tryDecodeBytes(value: string): string | null {
  const parts = value.split(',');
  // Real byte-coded API errors are typically 50+ bytes. The smallest
  // realistic JSON error '{"error":"x"}' is 14 bytes. Require a minimum
  // of 16 parts to avoid false positives on short numeric CSV fragments
  // like version strings, coordinates, or IP addresses.
  if (parts.length < 16) {
    return null;
  }
  const bytes: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    // Each part must be a non-negative integer in the byte range 0-255
    if (!/^\d{1,3}$/.test(trimmed)) {
      return null;
    }
    const num = Number(trimmed);
    if (num > 255 || (trimmed.length > 1 && trimmed.startsWith('0'))) {
      return null;
    }
    bytes.push(num);
  }
  try {
    // Use fatal: true to reject invalid UTF-8 sequences instead of
    // silently replacing them with U+FFFD replacement characters.
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(bytes),
    );

    // Validate the decoded string is mostly printable text.
    // Random byte sequences that happen to be valid UTF-8 would still
    // produce strings dominated by control characters.
    if (!isPrintableText(decoded)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Checks that a string is mostly printable characters (ASCII 0x20-0x7E,
 * plus common whitespace \n, \r, \t, and non-ASCII Unicode >= 0x80).
 * Returns false if more than 10% of characters are control characters,
 * which indicates the decoded bytes aren't meaningful text.
 */
function isPrintableText(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  let controlCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Allow printable ASCII (0x20-0x7E), tab, newline, carriage return,
    // and all non-ASCII Unicode (>= 0x80)
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      controlCount++;
    } else if (code === 0x7f) {
      controlCount++;
    }
  }
  return controlCount / text.length < 0.1;
}
