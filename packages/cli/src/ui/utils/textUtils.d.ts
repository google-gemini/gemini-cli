/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Calculates the maximum width of a multi-line ASCII art string.
 * @param asciiArt The ASCII art string.
 * @returns The length of the longest line in the ASCII art.
 */
export declare const getAsciiArtWidth: (asciiArt: string) => number;
/**
 * Checks if a string contains only ASCII characters (0-127).
 */
export declare function isAscii(str: string): boolean;
export declare function toCodePoints(str: string): string[];
export declare function cpLen(str: string): number;
/**
 * Converts a code point index to a UTF-16 code unit offset.
 */
export declare function cpIndexToOffset(str: string, cpIndex: number): number;
export declare function cpSlice(
  str: string,
  start: number,
  end?: number,
): string;
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
export declare function stripUnsafeCharacters(str: string): string;
/**
 * Sanitize a string for display in inline UI components (e.g. Help, Suggestions).
 * Removes ANSI codes, dangerous control characters, collapses whitespace
 * characters into a single space, and optionally truncates.
 */
export declare function sanitizeForDisplay(
  str: string,
  maxLength?: number,
): string;
/**
 * Normalizes escaped newline characters (e.g., "\\n") into actual newline characters.
 */
export declare function normalizeEscapedNewlines(value: string): string;
/**
 * Cached version of stringWidth function for better performance
 */
export declare const getCachedStringWidth: (str: string) => number;
export declare function escapeAnsiCtrlCodes<T>(obj: T): T;
