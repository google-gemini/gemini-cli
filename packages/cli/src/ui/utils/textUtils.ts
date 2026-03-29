/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import ansiRegex from 'ansi-regex';
import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';
import { LRUCache } from 'mnemonist';
import { LRU_BUFFER_PERF_CACHE_LIMIT } from '../constants.js';

/**
 * Calculates the maximum width of a multi-line ASCII art string.
 * @param asciiArt The ASCII art string.
 * @returns The length of the longest line in the ASCII art.
 */
export const getAsciiArtWidth = (asciiArt: string): number => {
  if (!asciiArt) {
    return 0;
  }
  const lines = asciiArt.split('\n');
  return Math.max(...lines.map((line) => line.length));
};

/*
 * -------------------------------------------------------------------------
 *  Unicode‑aware helpers (work at the code‑point level rather than UTF‑16
 *  code units so that surrogate‑pair emoji count as one "column".)
 * ---------------------------------------------------------------------- */

/**
 * Checks if a string contains only ASCII characters (0-127).
 */
export function isAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      return false;
    }
  }
  return true;
}

// Cache for code points
const MAX_STRING_LENGTH_TO_CACHE = 1000;
const codePointsCache = new LRUCache<string, string[]>(
  LRU_BUFFER_PERF_CACHE_LIMIT,
);

export function toCodePoints(str: string): string[] {
  // ASCII fast path
  if (isAscii(str)) {
    return str.split('');
  }

  // Cache short strings
  if (str.length <= MAX_STRING_LENGTH_TO_CACHE) {
    const cached = codePointsCache.get(str);
    if (cached !== undefined) {
      return cached;
    }
  }

  const result = Array.from(str);

  // Cache result
  if (str.length <= MAX_STRING_LENGTH_TO_CACHE) {
    codePointsCache.set(str, result);
  }

  return result;
}

export function cpLen(str: string): number {
  if (isAscii(str)) {
    return str.length;
  }
  return toCodePoints(str).length;
}

/**
 * Converts a code point index to a UTF-16 code unit offset.
 */
export function cpIndexToOffset(str: string, cpIndex: number): number {
  return cpSlice(str, 0, cpIndex).length;
}

export function cpSlice(str: string, start: number, end?: number): string {
  if (isAscii(str)) {
    return str.slice(start, end);
  }
  // Slice by code‑point indices and re‑join.
  const arr = toCodePoints(str).slice(start, end);
  return arr.join('');
}

/**
 * Strip characters that can break terminal rendering.
 *
 * Uses Node.js built-in stripVTControlCharacters to handle VT sequences,
 * then filters remaining control characters that can disrupt display.
 *
 * Characters stripped:
 * - ANSI escape sequences (via strip-ansi)
 * - VT control sequences (via Node.js util.stripVTControlCharacters)
 * - C0 control chars (0x00-0x1F) except TAB(0x09), LF(0x0A), CR(0x0D)
 * - C1 control chars (0x80-0x9F) that can cause display issues
 * - BiDi control chars (U+200E, U+200F, U+202A-U+202E, U+2066-U+2069)
 * - Zero-width chars (U+200B, U+FEFF)
 *
 * Characters preserved:
 * - All printable Unicode including emojis
 * - ZWJ (U+200D) - needed for complex emoji sequences
 * - ZWNJ (U+200C) - preserve zero-width non-joiner
 * - DEL (0x7F) - handled functionally by applyOperations, not a display issue
 * - CR/LF (0x0D/0x0A) - needed for line breaks
 * - TAB (0x09) - preserve tabs
 */
export function stripUnsafeCharacters(str: string): string {
  const strippedAnsi = stripAnsi(str);
  const strippedVT = stripVTControlCharacters(strippedAnsi);

  // Use a regex to strip remaining unsafe control characters
  // C0: 0x00-0x1F except 0x09 (TAB), 0x0A (LF), 0x0D (CR)
  // C1: 0x80-0x9F
  // BiDi: U+200E (LRM), U+200F (RLM), U+202A-U+202E, U+2066-U+2069
  // Zero-width: U+200B (ZWSP), U+FEFF (BOM)
  return strippedVT.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x80-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/g,
    '',
  );
}

/**
 * Sanitize a string for display in inline UI components (e.g. Help, Suggestions).
 * Removes ANSI codes, dangerous control characters, collapses whitespace
 * characters into a single space, and optionally truncates.
 */
export function sanitizeForDisplay(str: string, maxLength?: number): string {
  if (!str) {
    return '';
  }

  let sanitized = stripUnsafeCharacters(str).replace(/\s+/g, ' ');

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
  }

  return sanitized;
}

/**
 * Normalizes escaped newline characters (e.g., "\\n") into actual newline characters.
 */
export function normalizeEscapedNewlines(value: string): string {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

const stringWidthCache = new LRUCache<string, number>(
  LRU_BUFFER_PERF_CACHE_LIMIT,
);

/**
 * Cached version of stringWidth function for better performance
 */
export const getCachedStringWidth = (str: string): number => {
  // ASCII printable chars (32-126) have width 1.
  // This is a very frequent path, so we use a fast numeric check.
  if (str.length === 1) {
    const code = str.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      return 1;
    }
  }

  const cached = stringWidthCache.get(str);
  if (cached !== undefined) {
    return cached;
  }

  let width: number;
  try {
    width = stringWidth(str);
  } catch {
    // Fallback for characters that cause string-width to crash (e.g. U+0602)
    // See: https://github.com/google-gemini/gemini-cli/issues/16418
    width = toCodePoints(stripAnsi(str)).length;
  }

  stringWidthCache.set(str, width);

  return width;
};

const regex = ansiRegex();

/* Recursively traverses a JSON-like structure (objects, arrays, primitives)
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
  if (typeof obj === 'string') {
    if (obj.search(regex) === -1) {
      return obj; // No changes return original string
    }

    regex.lastIndex = 0; // needed for global regex
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value = obj[i];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const escapedValue = escapeAnsiCtrlCodes(value);
      if (escapedValue !== value) {
        if (newArr === null) {
          newArr = [...obj];
        }
        newArr[i] = escapedValue;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (newArr !== null ? newArr : obj) as T;
  }

  let newObj: T | null = null;
  const keys = Object.keys(obj);

  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const value = (obj as Record<string, unknown>)[key];
    const escapedValue = escapeAnsiCtrlCodes(value);

    if (escapedValue !== value) {
      if (newObj === null) {
        newObj = { ...obj };
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (newObj as Record<string, unknown>)[key] = escapedValue;
    }
  }

  return newObj !== null ? newObj : obj;
}
