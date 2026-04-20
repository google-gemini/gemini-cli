/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ANSI escape sequences for controlling terminal cursor shape.
 *
 * Used to provide visual feedback for vim mode: block cursor in NORMAL mode,
 * bar cursor in INSERT mode, matching the behavior of real vim/neovim terminals.
 *
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h4-Functions-using-CSI-_-ordered-by-the-final-character-lparen-s-rparen:CSI-Ps-SP-q.1D81
 */

/** Steady block cursor (for NORMAL mode). */
export const CURSOR_BLOCK = '\x1b[2 q';

/** Steady bar cursor (for INSERT mode). */
export const CURSOR_BAR = '\x1b[6 q';

/** Reset cursor shape to terminal default. */
export const CURSOR_DEFAULT = '\x1b[0 q';

/**
 * Writes an ANSI cursor shape escape sequence to stdout.
 *
 * Silently ignores errors (e.g., when stdout is not a TTY or has been closed).
 */
function writeCursorSequence(sequence: string): void {
  try {
    if (process.stdout?.writable) {
      process.stdout.write(sequence);
    }
  } catch {
    // Ignore errors — stdout may be closed or not a TTY.
  }
}

/** Set cursor to steady block (vim NORMAL mode). */
export function setCursorBlock(): void {
  writeCursorSequence(CURSOR_BLOCK);
}

/** Set cursor to steady bar (vim INSERT mode). */
export function setCursorBar(): void {
  writeCursorSequence(CURSOR_BAR);
}

/** Reset cursor shape to terminal default. */
export function resetCursorShape(): void {
  writeCursorSequence(CURSOR_DEFAULT);
}
