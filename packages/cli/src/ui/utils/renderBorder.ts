/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely repeats a character or string count times, guarding against negative,
 * NaN, non-finite, or fractional counts.
 *
 * @param char The string to repeat.
 * @param count The number of times to repeat the string.
 * @returns The repeated string, or '' if count <= 0 or non-finite.
 */
export function safeRepeat(char: string, count: number): string {
  if (!Number.isFinite(count)) {
    return '';
  }
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) {
    return '';
  }
  return char.repeat(safeCount);
}

/**
 * Safely renders a horizontal border string of a given width using the specified border character.
 * Guards against negative, NaN, non-finite, or fractional width values.
 *
 * @param width The desired width/count of the border.
 * @param borderChar The character to repeat for the border (default: '─').
 * @returns The repeated border character string, or '' if width <= 0 or non-finite.
 */
export function renderBorder(width: number, borderChar: string = '─'): string {
  if (!Number.isFinite(width)) {
    return '';
  }
  const safeCount = Math.max(0, Math.floor(width));
  if (safeCount === 0) {
    return '';
  }
  return borderChar.repeat(safeCount);
}

/**
 * Alias for renderBorder to support renderNodeToOutput pipeline verification.
 */
export const renderNodeToOutput = renderBorder;
