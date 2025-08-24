/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import { stripVTControlCharacters } from 'util';

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

const codePointsCache = new Map<string, string[]>();
const stringWidthCache = new Map<string, number>();
const CACHE_SIZE_LIMIT = 1000;

function clearOldestCacheEntries() {
  if (codePointsCache.size > CACHE_SIZE_LIMIT) {
    const entriesToDelete = Array.from(codePointsCache.keys()).slice(
      0,
      Math.floor(CACHE_SIZE_LIMIT * 0.1),
    );
    entriesToDelete.forEach((key) => codePointsCache.delete(key));
  }
  if (stringWidthCache.size > CACHE_SIZE_LIMIT) {
    const entriesToDelete = Array.from(stringWidthCache.keys()).slice(
      0,
      Math.floor(CACHE_SIZE_LIMIT * 0.1),
    );
    entriesToDelete.forEach((key) => stringWidthCache.delete(key));
  }
}

export function getCachedStringWidth(str: string): number {
  if (stringWidthCache.has(str)) {
    return stringWidthCache.get(str)!;
  }

  // Fast path for single ASCII characters
  if (str.length === 1) {
    const code = str.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      // printable ASCII
      stringWidthCache.set(str, 1);
      return 1;
    }
  }

  const width = stringWidth(str);
  stringWidthCache.set(str, width);
  if (stringWidthCache.size > CACHE_SIZE_LIMIT) {
    clearOldestCacheEntries();
  }
  return width;
}

export function toCodePoints(str: string): string[] {
  if (codePointsCache.has(str)) {
    return codePointsCache.get(str)!;
  }

  // Fast path for ASCII strings
  // eslint-disable-next-line no-control-regex
  if (/^[\u0000-\u007F]*$/.test(str)) {
    const codePoints = str.split('');
    codePointsCache.set(str, codePoints);
    return codePoints;
  }

  const codePoints = Array.from(str);
  codePointsCache.set(str, codePoints);
  if (codePointsCache.size > CACHE_SIZE_LIMIT) {
    clearOldestCacheEntries();
  }
  return codePoints;
}

export function cpLen(str: string): number {
  return toCodePoints(str).length;
}

const sliceCache = new Map<string, string>();

export function cpSlice(str: string, start: number, end?: number): string {
  const cacheKey = `${str}:${start}:${end ?? 'undefined'}`;
  if (sliceCache.has(cacheKey)) {
    return sliceCache.get(cacheKey)!;
  }

  const arr = toCodePoints(str).slice(start, end);
  const result = arr.join('');
  sliceCache.set(cacheKey, result);
  if (sliceCache.size > CACHE_SIZE_LIMIT) {
    const entriesToDelete = Array.from(sliceCache.keys()).slice(
      0,
      Math.floor(CACHE_SIZE_LIMIT * 0.1),
    );
    entriesToDelete.forEach((key) => sliceCache.delete(key));
  }
  return result;
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
