/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

/**
 * Returns the color depth of the current terminal.
 * Returns 24 (TrueColor) if unknown or not a TTY.
 */
export function getColorDepth(): number {
  return process.stdout.getColorDepth ? process.stdout.getColorDepth() : 24;
}

/**
 * Returns true if the terminal has low color depth (less than 24-bit).
 */
export function isLowColorDepth(): boolean {
  return getColorDepth() < 24;
}

let cachedIsITerm2: boolean | undefined;

/**
 * Returns true if the current terminal is iTerm2.
 */
export function isITerm2(): boolean {
  if (cachedIsITerm2 !== undefined) {
    return cachedIsITerm2;
  }

  cachedIsITerm2 = process.env['TERM_PROGRAM'] === 'iTerm.app';

  return cachedIsITerm2;
}

/**
 * Resets the cached iTerm2 detection value.
 * Primarily used for testing.
 */
export function resetITerm2Cache(): void {
  cachedIsITerm2 = undefined;
}
