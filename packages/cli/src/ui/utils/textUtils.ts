/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import ansiRegex from 'ansi-regex';
import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';
import { setStringWidthFunction } from 'ink';
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
 * This is a strict sanitization function intended for general display
 * contexts. It strips all C1 control characters (0x80-0x9F) and VT
 * control sequences. For list display contexts where a more lenient
 * approach is needed (preserving C1 characters and only stripping ANSI
 * codes and newlines/tabs), use a separate function instead.
 *
 * Processing order:
 * 1. stripAnsi removes ANSI escape sequences (including 8-bit CSI 0x9B)
 * 2. Regex strips C0, C1, BiDi, and zero-width control characters
 * 3. stripVTControlCharacters removes any remaining VT sequences
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

  // Strip C0, C1, and other unsafe characters via regex first.
  // This is more efficient than multiple replaces and crucially removes C1
  // characters (e.g., 0x90 DCS) before they can be misinterpreted by
  // stripVTControlCharacters, which could otherwise cause data loss.
  const strippedWithRegex = strippedAnsi.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x80-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/g,
    '',
  );

  // Finally, use stripVTControlCharacters for any remaining VT sequences
  // that the regex might not cover.
  return stripVTControlCharacters(strippedWithRegex);
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

const NON_CODE_ESCAPED_NEWLINE_REGEX =
  /("(?:\\r\\n|\\n)"|'(?:\\r\\n|\\n)'|[A-Za-z]:(?:(?!(?:\\r\\n|\\n)(?:[A-Z\s\\]|$))\\[a-zA-Z0-9_.-]+)+|\\\\)|\\r\\n|\\n/g;

function normalizeNonCodeSegment(segment: string): string {
  return segment.replace(
    NON_CODE_ESCAPED_NEWLINE_REGEX,
    (_match, preserved: string | undefined) => preserved ?? '\n',
  );
}

interface BacktickRun {
  start: number;
  end: number;
  len: number;
  line: number;
  escaped: boolean;
}

/**
 * Normalizes unescaped newline sequences (e.g., "\\n", "\\r\\n") into actual
 * newline characters while preserving escaped backslashes ("\\\\n"), Windows
 * drive paths (e.g., "C:\\new_folder", "D:\\notes"), inline/fenced code blocks
 * (e.g., "`\\n`"), and standalone quoted escape tokens (e.g., '"\\n"').
 */
export function normalizeEscapedNewlines(value: string): string {
  if (!value.includes('\\n')) {
    return value;
  }
  if (!value.includes('`')) {
    return normalizeNonCodeSegment(value);
  }

  const runs: BacktickRun[] = [];
  const unescapedSingleTickCountByLine = new Map<number, number>();
  let line = 0;
  let i = 0;

  while (i < value.length) {
    const ch = value.charCodeAt(i);
    if (ch === 10 /* \n */) {
      line++;
      i++;
      continue;
    }
    if (ch === 96 /* ` */) {
      let end = i + 1;
      while (end < value.length && value.charCodeAt(end) === 96) {
        end++;
      }
      let backslashes = 0;
      while (
        i - 1 - backslashes >= 0 &&
        value.charCodeAt(i - 1 - backslashes) === 92 /* \ */
      ) {
        backslashes++;
      }
      const len = end - i;
      const escaped = backslashes % 2 === 1;
      if (len === 1 && !escaped) {
        unescapedSingleTickCountByLine.set(
          line,
          (unescapedSingleTickCountByLine.get(line) ?? 0) + 1,
        );
      }
      runs.push({ start: i, end, len, line, escaped });
      i = end;
      continue;
    }
    i++;
  }

  const isIgnoredSingleTick = (run: BacktickRun): boolean => {
    if (run.len !== 1 || !run.escaped) {
      return false;
    }
    const unescapedCount = unescapedSingleTickCountByLine.get(run.line) ?? 0;
    return unescapedCount > 0 && unescapedCount % 2 === 0;
  };

  const maxRunIndexByLen = new Map<number, number>();
  for (let idx = 0; idx < runs.length; idx++) {
    if (!isIgnoredSingleTick(runs[idx])) {
      maxRunIndexByLen.set(runs[idx].len, idx);
    }
  }

  let lastIndex = 0;
  let result = '';
  let r = 0;

  while (r < runs.length) {
    const openRun = runs[r];
    if (
      isIgnoredSingleTick(openRun) ||
      (maxRunIndexByLen.get(openRun.len) ?? -1) <= r
    ) {
      r++;
      continue;
    }

    let closeIdx = r + 1;
    while (
      closeIdx < runs.length &&
      (runs[closeIdx].len !== openRun.len ||
        isIgnoredSingleTick(runs[closeIdx]))
    ) {
      closeIdx++;
    }

    const closeRun = runs[closeIdx];
    result += normalizeNonCodeSegment(value.slice(lastIndex, openRun.start));
    result += value.slice(openRun.start, closeRun.end);
    lastIndex = closeRun.end;
    r = closeIdx + 1;
  }

  result += normalizeNonCodeSegment(value.slice(lastIndex));
  return result;
}

const stringWidthCache = new LRUCache<string, number>(
  LRU_BUFFER_PERF_CACHE_LIMIT,
);

// Thai SARA AM (U+0E33) and Lao SARA AM (U+0EB3) have General_Category=Lo
// (spacing letters that occupy 1 terminal column via wcwidth), but their
// Grapheme_Cluster_Break=SpacingMark property causes Intl.Segmenter in
// string-width to merge them with a preceding base character and ignore their
// width. Replacing them with a 1-column ASCII space ensures each SARA AM is
// measured as its own column.
const SARA_AM_REGEX = /[\u0E33\u0EB3]/g;

let ambiguousCharactersWide = false;

/**
 * Configures how East Asian Ambiguous-width characters (box-drawing borders,
 * `…`, `●`, arrows, ...) are measured.
 *
 * Most terminals render them in a single cell, but terminals such as
 * Terminal.app with "Unicode East Asian Ambiguous characters are wide" (and
 * other CJK-oriented configurations) render them in two. Measuring them as one
 * cell there makes every bordered row wider than the terminal; the rows wrap
 * and the incremental renderer leaves a copy of the previous frame behind on
 * every render (see https://github.com/google-gemini/gemini-cli/issues/24181).
 *
 * Ink measures through `getCachedStringWidth` as well, so this re-registers it
 * to drop Ink's own per-character width cache along with ours.
 */
export function setAmbiguousCharactersWide(wide: boolean): void {
  if (wide === ambiguousCharactersWide) {
    return;
  }
  ambiguousCharactersWide = wide;
  stringWidthCache.clear();
  setStringWidthFunction(getCachedStringWidth);
}

/** Whether ambiguous-width characters are currently measured as two cells. */
export function areAmbiguousCharactersWide(): boolean {
  return ambiguousCharactersWide;
}

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
    width = stringWidth(str.replace(SARA_AM_REGEX, ' '), {
      ambiguousIsNarrow: !ambiguousCharactersWide,
    });
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
