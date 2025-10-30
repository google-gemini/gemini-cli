/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import ansiRegex from 'ansi-regex';
import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';
import {
  tokenize,
  styledCharsFromTokens,
  type StyledChar,
} from '@alcalzone/ansi-tokenize';

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
 *  Unicode‑aware helpers (work at the grapheme cluster level to properly
 *  handle combining marks, emoji, and surrogate pairs)
 * ---------------------------------------------------------------------- */

// Cache for grapheme segmentation results (aligns with Ink's toStyledCharactersCache)
const graphemeCache = new Map<string, string[]>();
const MAX_STRING_LENGTH_TO_CACHE = 1000;

/**
 * Splits a string into an array of grapheme clusters (user-perceived characters).
 *
 * This implementation aligns with Ink's toStyledCharacters() logic for consistent
 * cursor positioning and text wrapping. It manually combines Unicode sequences:
 * - Regional indicators (flags)
 * - Combining marks (diacritics)
 * - Variation selectors
 * - Skin tone modifiers
 * - Zero-width joiners (ZWJ)
 * - Keycaps
 * - Tags block
 *
 * This is critical for:
 * - Cursor positioning in text editors (must match Ink's behavior)
 * - Backspace/delete operations
 * - Text selection and manipulation
 * - Vim mode navigation
 *
 * @param str - The string to split into grapheme clusters
 * @returns An array of grapheme clusters
 *
 * @example
 * toGraphemes('café') // ['c', 'a', 'f', 'é']
 * toGraphemes('👨‍👩‍👧‍👦') // ['👨‍👩‍👧‍👦'] (single family emoji)
 */
export function toGraphemes(str: string): string[] {
  // ASCII fast-path: avoid tokenization overhead for pure ASCII
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
    const cached = graphemeCache.get(str);
    if (cached) {
      return cached;
    }
  }

  // Use Ink's approach: tokenize ANSI, then manually combine grapheme clusters
  const tokens = tokenize(str);
  const characters = styledCharsFromTokens(tokens);
  const combinedCharacters: string[] = [];

  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    if (!character) {
      continue;
    }

    // Handle tab expansion (4 spaces like Ink)
    if (character.value === '\t') {
      combinedCharacters.push(' ', ' ', ' ', ' ');
      continue;
    }

    // Skip backspace
    if (character.value === '\b') {
      continue;
    }

    let { value } = character;
    const firstCodePoint = value.codePointAt(0);

    // 1. Regional Indicators (Flags)
    // These combine in pairs.
    // See: https://en.wikipedia.org/wiki/Regional_indicator_symbol
    if (
      firstCodePoint &&
      firstCodePoint >= 0x1f1e6 &&
      firstCodePoint <= 0x1f1ff &&
      i + 1 < characters.length
    ) {
      const nextCharacter = characters[i + 1];

      if (nextCharacter) {
        const nextFirstCodePoint = nextCharacter.value.codePointAt(0);

        if (
          nextFirstCodePoint &&
          nextFirstCodePoint >= 0x1f1e6 &&
          nextFirstCodePoint <= 0x1f1ff
        ) {
          value += nextCharacter.value;
          i++;

          combinedCharacters.push(value);
          continue;
        }
      }
    }

    // 2. Other combining characters
    // See: https://en.wikipedia.org/wiki/Combining_character
    while (i + 1 < characters.length) {
      const nextCharacter = characters[i + 1];

      if (!nextCharacter) {
        break;
      }

      const codePoints = [...nextCharacter.value].map((char) =>
        char.codePointAt(0),
      );

      const nextFirstCodePoint = codePoints[0];

      if (!nextFirstCodePoint) {
        break;
      }

      // Variation selectors
      const isVariationSelector =
        nextFirstCodePoint >= 0xfe00 && nextFirstCodePoint <= 0xfe0f;

      // Skin tone modifiers
      const isSkinToneModifier =
        nextFirstCodePoint >= 0x1f3fb && nextFirstCodePoint <= 0x1f3ff;

      const isZeroWidthJoiner = nextFirstCodePoint === 0x200d;
      const isKeycap = nextFirstCodePoint === 0x20e3;

      // Tags block (U+E0000 - U+E007F)
      const isTagsBlock =
        nextFirstCodePoint >= 0xe0000 && nextFirstCodePoint <= 0xe007f;

      // Combining Diacritical Marks
      const isCombiningMark =
        nextFirstCodePoint >= 0x0300 && nextFirstCodePoint <= 0x036f;

      const isCombining =
        isVariationSelector ||
        isSkinToneModifier ||
        isZeroWidthJoiner ||
        isKeycap ||
        isTagsBlock ||
        isCombiningMark;

      if (!isCombining) {
        break;
      }

      // Merge with previous character
      value += nextCharacter.value;
      i++; // Consume next character.

      // If it was a ZWJ, also consume the character after it.
      if (isZeroWidthJoiner && i + 1 < characters.length) {
        const characterAfterZwj = characters[i + 1];

        if (characterAfterZwj) {
          value += characterAfterZwj.value;
          i++; // Consume character after ZWJ.
        }
      }
    }

    combinedCharacters.push(value);
  }

  // Cache result
  if (str.length <= MAX_STRING_LENGTH_TO_CACHE) {
    graphemeCache.set(str, combinedCharacters);
  }

  return combinedCharacters;
}

/**
 * Split a string into Unicode code points (not grapheme clusters).
 *
 * @deprecated Use `toGraphemes` for UI-related operations that need to work with
 * user-perceived characters. This function splits by code points and should only
 * be used for internal logic that needs to inspect individual code points
 * (e.g., `stripUnsafeCharacters` which filters control characters).
 *
 * Note: Code points are NOT the same as grapheme clusters. For example:
 * - toCodePoints('é') may return ['e', '́'] (base + combining mark)
 * - toGraphemes('é') returns ['é'] (single grapheme cluster)
 *
 * @param str - The string to split into code points
 * @returns An array of code points (handling surrogate pairs correctly)
 */
export function toCodePoints(str: string): string[] {
  // ASCII fast-path for performance (stripUnsafeCharacters is called on every keypress/paste)
  let isAscii = true;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      isAscii = false;
      break;
    }
  }

  if (isAscii) {
    // Pure ASCII, split('') is faster
    return str.split('');
  }

  // Non-ASCII: Use spread operator which correctly handles surrogate pairs
  return [...str];
}

/**
 * Get the length of a string in code points (not grapheme clusters).
 *
 * This function returns code point count, which is used for offset calculations
 * in logicalPosToOffset/offsetToLogicalPos. For UI display purposes (cursor
 * positioning, text width), use toGraphemes().length instead.
 *
 * @param str - The string to measure
 * @returns The number of code points
 */
export function cpLen(str: string): number {
  return toCodePoints(str).length;
}

/**
 * Slice a string by grapheme cluster indices.
 *
 * @param str - The string to slice
 * @param start - The starting grapheme index
 * @param end - The ending grapheme index (optional)
 * @returns The sliced string
 */
export function cpSlice(str: string, start: number, end?: number): string {
  const arr = toGraphemes(str).slice(start, end);
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

/**
 * Clear the grapheme cache (for testing purposes)
 */
export const clearGraphemeCache = (): void => {
  graphemeCache.clear();
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
