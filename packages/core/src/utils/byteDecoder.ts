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

  // Try splitting on ". " to find a prefix + byte-coded body
  // (e.g., "got status: 429 Too Many Requests. 91,123,10,...")
  const dotIndex = value.lastIndexOf('. ');
  if (dotIndex !== -1) {
    const prefix = value.substring(0, dotIndex + 2);
    const rest = value.substring(dotIndex + 2);
    const decodedRest = tryDecodeBytes(rest);
    if (decodedRest !== null) {
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
  // Require at least a few parts to avoid false positives on normal text with commas
  if (parts.length < 4) {
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
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}
