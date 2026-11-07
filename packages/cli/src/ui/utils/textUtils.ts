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

  // Measure and truncate by code points so surrogate pairs (e.g. emoji) are
  // never split. The end index is clamped because, unlike substring(),
  // cpSlice() treats a negative end as an offset from the end of the string.
  if (maxLength && cpLen(sanitized) > maxLength) {
    sanitized = cpSlice(sanitized, 0, Math.max(0, maxLength - 3)) + '...';
  }

  return sanitized;
}

export { normalizeEscapedNewlines } from '@google/gemini-cli-core';

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

/**
 * Narrow OSC 8 hyperlink preservation for the CLI's own Google sign-in
 * message (see issue #29430).
 *
 * The TUI normally neutralises every ANSI/OSC sequence in displayed text:
 * HistoryItemDisplay escapes them via escapeAnsiCtrlCodes, and RenderInline
 * strips them via stripUnsafeCharacters. That is the right default — model
 * and tool output must never be able to inject a clickable link — but it
 * also breaks the one link the CLI itself generates during web sign-in,
 * whose whole point is to survive terminal wrapping.
 *
 * The exception below is deliberately tiny. A hyperlink is preserved only
 * when ALL of the following hold:
 * - it has no OSC 8 parameters (the `8;;` form only),
 * - its visible label is exactly "Open authentication page" (the label the
 *   sign-in flow itself uses, so an injected link cannot masquerade as
 *   something else),
 * - its target parses as https://accounts.google.com/o/oauth2/v2/auth with
 *   no userinfo and no fragment,
 * - response_type=code, and
 * - redirect_uri is a loopback callback (http://127.0.0.1:<port>/oauth2callback).
 *
 * Why that shape is safe to click even if it appeared in untrusted text:
 * the redirect can only go to the user's own loopback interface, the
 * callback server rejects any state that does not match the sign-in flow's
 * random state, and an authorization code is bound to the OAuth client
 * that requested it, so a code issued for a different client cannot be
 * exchanged by this CLI. Every other ANSI/OSC sequence — including OSC 8
 * links to any other domain, to this endpoint with a non-loopback
 * redirect, or with a different label — is escaped/stripped exactly as
 * before.
 *
 * Preservation is implemented by masking: allowlisted sequences are
 * temporarily replaced with a private-use placeholder (U+E000, which
 * neither ansi-regex nor the strippers touch) before sanitising, then
 * restored afterwards. If the input already contains the placeholder
 * character, masking is skipped entirely and the text is sanitised as
 * before, so a crafted placeholder can never smuggle a link through.
 */
const AUTH_LINK_LABEL = 'Open authentication page';
const AUTH_LINK_SENTINEL = '\uE000';
const AUTH_LINK_PLACEHOLDER_PREFIX = `${AUTH_LINK_SENTINEL}AUTHLINK`;

// Matches one complete OSC 8 hyperlink: ESC ] 8 ; params ; target ST label
// ESC ] 8 ;; ST, where ST is ESC \ or BEL.
const OSC8_HYPERLINK_REGEX =
  // eslint-disable-next-line no-control-regex
  /\u001b\]8;([^;]*);([^\u001b\u0007]*?)(?:\u001b\\|\u0007)([^\u001b]*?)\u001b\]8;;(?:\u001b\\|\u0007)/g;

function isAllowlistedAuthTarget(target: string): boolean {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f]/.test(target)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'accounts.google.com' ||
    url.pathname !== '/o/oauth2/v2/auth' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.searchParams.get('response_type') !== 'code'
  ) {
    return false;
  }
  const redirectUri = url.searchParams.get('redirect_uri');
  if (!redirectUri) {
    return false;
  }
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return false;
  }
  return (
    redirect.protocol === 'http:' &&
    redirect.hostname === '127.0.0.1' &&
    redirect.port !== '' &&
    redirect.pathname === '/oauth2callback' &&
    redirect.search === '' &&
    redirect.hash === '' &&
    redirect.username === '' &&
    redirect.password === ''
  );
}

export interface MaskedAuthLinks {
  text: string;
  links: string[];
}

export function maskAllowlistedAuthHyperlinks(str: string): MaskedAuthLinks {
  if (str.includes(AUTH_LINK_SENTINEL)) {
    return { text: str, links: [] };
  }
  const links: string[] = [];
  OSC8_HYPERLINK_REGEX.lastIndex = 0;
  const text = str.replace(
    OSC8_HYPERLINK_REGEX,
    (match, params: string, target: string, label: string) => {
      if (
        params !== '' ||
        label !== AUTH_LINK_LABEL ||
        !isAllowlistedAuthTarget(target)
      ) {
        return match;
      }
      const index = links.push(match) - 1;
      return `${AUTH_LINK_PLACEHOLDER_PREFIX}${index}${AUTH_LINK_SENTINEL}`;
    },
  );
  return { text, links };
}

export function restoreMaskedAuthHyperlinks(
  str: string,
  links: string[],
): string {
  if (links.length === 0) {
    return str;
  }
  let result = str;
  for (let i = 0; i < links.length; i++) {
    const placeholder = `${AUTH_LINK_PLACEHOLDER_PREFIX}${i}${AUTH_LINK_SENTINEL}`;
    const link = links[i];
    if (link !== undefined) {
      result = result.split(placeholder).join(link);
    }
  }
  return result;
}

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
    const { text: masked, links } = maskAllowlistedAuthHyperlinks(obj);
    if (masked.search(regex) === -1) {
      // No changes: return the original string (restoring any masked
      // allowlisted links, which are unchanged by definition).
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return restoreMaskedAuthHyperlinks(masked, links) as T;
    }

    regex.lastIndex = 0; // needed for global regex
    const escaped = masked.replace(regex, (match) =>
      JSON.stringify(match).slice(1, -1),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return restoreMaskedAuthHyperlinks(escaped, links) as T;
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
