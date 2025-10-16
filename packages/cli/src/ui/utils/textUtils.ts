/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import ansiRegex from 'ansi-regex';
import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';

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

// Cache for code points to reduce GC pressure
const codePointsCache = new Map<string, string[]>();
const MAX_STRING_LENGTH_TO_CACHE = 1000;

export function toCodePoints(str: string): string[] {
  // ASCII fast path - check if all chars are ASCII (0-127)
  let isAscii = true;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      isAscii = false;
      break;
    }
  }
  if (isAscii) {
    return str.split('');
  }

  // Cache short strings
  if (str.length <= MAX_STRING_LENGTH_TO_CACHE) {
    const cached = codePointsCache.get(str);
    if (cached) {
      return cached;
    }
  }

  const result = Array.from(str);

  // Cache result (unlimited like Ink)
  if (str.length <= MAX_STRING_LENGTH_TO_CACHE) {
    codePointsCache.set(str, result);
  }

  return result;
}

export function cpLen(str: string): number {
  return toCodePoints(str).length;
}

export function cpSlice(str: string, start: number, end?: number): string {
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
 * - C0 control chars (0x00-0x1F) except CR/LF which are handled elsewhere
 * - C1 control chars (0x80-0x9F) that can cause display issues
 *
 * Characters preserved:
 * - All printable Unicode including emojis
 * - DEL (0x7F) - handled functionally by applyOperations, not a display issue
 * - CR/LF (0x0D/0x0A) - needed for line breaks
 */
export function stripUnsafeCharacters(str: string): string {
  const strippedAnsi = stripAnsi(str);
  const strippedVT = stripVTControlCharacters(strippedAnsi);

  return toCodePoints(strippedVT)
    .filter((char) => {
      const code = char.codePointAt(0);
      if (code === undefined) return false;

      // Preserve CR/LF for line handling
      if (code === 0x0a || code === 0x0d) return true;

      // Remove C0 control chars (except CR/LF) that can break display
      // Examples: BELL(0x07) makes noise, BS(0x08) moves cursor, VT(0x0B), FF(0x0C)
      if (code >= 0x00 && code <= 0x1f) return false;

      // Remove C1 control chars (0x80-0x9f) - legacy 8-bit control codes
      if (code >= 0x80 && code <= 0x9f) return false;

      // Preserve DEL (0x7f) - it's handled functionally by applyOperations as backspace
      // and doesn't cause rendering issues when displayed

      // Preserve all other characters including Unicode/emojis
      return true;
    })
    .join('');
}

// String width caching for performance optimization
const stringWidthCache = new Map<string, number>();

/**
 * Cached version of stringWidth function for better performance
 * Follows Ink's approach with unlimited cache (no eviction)
 */
export const getCachedStringWidth = (str: string): number => {
  // ASCII printable chars have width 1
  if (/^[\x20-\x7E]*$/.test(str)) {
    return str.length;
  }

  if (stringWidthCache.has(str)) {
    return stringWidthCache.get(str)!;
  }

  const width = stringWidth(str);
  stringWidthCache.set(str, width);

  return width;
};

/**
 * Clear the string width cache
 */
export const clearStringWidthCache = (): void => {
  stringWidthCache.clear();
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
