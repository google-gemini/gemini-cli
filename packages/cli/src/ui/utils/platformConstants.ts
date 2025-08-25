/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal Platform Constants
 *
 * This file contains terminal-related constants used throughout the application,
 * specifically for handling keyboard inputs and terminal protocols.
 */

/**
 * Kitty keyboard protocol sequences for enhanced keyboard input.
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
export const KITTY_CTRL_C = '[99;5u';

/**
 * Kitty keyboard protocol keycodes
 */
export const KITTY_KEYCODE_ENTER = 13;
export const KITTY_KEYCODE_NUMPAD_ENTER = 57414;
export const KITTY_KEYCODE_TAB = 9;
export const KITTY_KEYCODE_BACKSPACE = 127;

/**
 * Timing constants for terminal interactions
 */
export const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

/**
 * VS Code terminal integration constants
 */
export const VSCODE_SHIFT_ENTER_SEQUENCE = '\\\r\n';

/**
 * Backslash + Enter detection window in milliseconds.
 * Used to detect Shift+Enter pattern where backslash
 * is followed by Enter within this timeframe.
 */
export const BACKSLASH_ENTER_DETECTION_WINDOW_MS = 5;

/**
 * Maximum expected length of a Kitty keyboard protocol sequence.
 * Format: ESC [ <keycode> ; <modifiers> u/~
 * Example: \x1b[13;2u (Shift+Enter) = 8 chars
 * Longest reasonable: \x1b[127;15~ = 11 chars (Del with all modifiers)
 * We use 12 to provide a small buffer.
 */
export const MAX_KITTY_SEQUENCE_LENGTH = 12;
