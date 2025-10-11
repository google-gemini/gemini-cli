/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ansiRegex from 'ansi-regex';

/**
 * Recursively traverses a JSON-like structure (objects, arrays, primitives)
 * and escapes all ANSI control characters found in any string values.
 *
 * This function is designed to be robust, handling deeply nested objects and
 * arrays. It applies a regex-based replacement to all string values to
 * safely escape control characters.
 *
 * To optimize performance, this function uses a "copy-on-write" strategy.
 * It avoids allocating new objects or arrays if no nested string values
 * required escaping, returning the original object reference in such cases.
 *
 * @param obj The JSON-like value (object, array, string, etc.) to traverse.
 * @returns A new value with all nested string fields escaped, or the
 * original `obj` reference if no changes were necessary.
 */
export function escapeAnsiCtrlCodes<T>(obj: T): T {
  const regex = ansiRegex();
  if (typeof obj === 'string') {
    if (obj.search(regex) === -1) {
      return obj; // No changes return original string
    }

    regex.lastIndex = 0; // needed for global regex
    return obj.replace(regex, (match) =>
      JSON.stringify(match).slice(1, -1),
    ) as T;
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    let newArr: unknown[] | null = null;

    for (let i = 0; i < obj.length; i++) {
      const value = obj[i];
      const escapedValue = escapeAnsiCtrlCodes(value);
      if (escapedValue !== value) {
        if (newArr === null) {
          newArr = [...obj];
        }
        newArr[i] = escapedValue;
      }
    }
    return (newArr !== null ? newArr : obj) as T;
  }

  let newObj: T | null = null;
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    const escapedValue = escapeAnsiCtrlCodes(value);

    if (escapedValue !== value) {
      if (newObj === null) {
        newObj = { ...obj };
      }
      (newObj as Record<string, unknown>)[key] = escapedValue;
    }
  }

  return newObj !== null ? newObj : obj;
}

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
