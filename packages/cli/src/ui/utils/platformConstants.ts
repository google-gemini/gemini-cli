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
 * Kitty modifier decoding constants
 *
 * In Kitty/Ghostty, the modifier parameter is encoded as (1 + bitmask).
 * Some terminals also set bit 7 (i.e., add 128) when reporting event types.
 */
export const KITTY_MODIFIER_BASE = 1; // Base value per spec before bitmask decode
export const KITTY_MODIFIER_EVENT_TYPES_OFFSET = 128; // Added when event types are included

/**
 * Modifier bit flags for Kitty/Xterm-style parameters.
 *
 * Per spec, the modifiers parameter encodes (1 + bitmask) where:
 * - 1: no modifiers
 * - bit 0 (1): Shift
 * - bit 1 (2): Alt/Option (reported as "alt" in spec; we map to meta)
 * - bit 2 (4): Ctrl
 *
 * Some terminals add 128 to the entire modifiers field when reporting event types.
 * See: https://sw.kovidgoyal.net/kitty/keyboard-protocol/#modifiers
 */
export const MODIFIER_SHIFT_BIT = 1;
export const MODIFIER_ALT_BIT = 2;
export const MODIFIER_CTRL_BIT = 4;

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
// Increased to accommodate parameterized forms and occasional colon subfields
// while still being small enough to avoid pathological buffering.
export const MAX_KITTY_SEQUENCE_LENGTH = 32;

/**
 * Character codes for common escape sequences
 */
export const CHAR_CODE_ESC = 27;
export const CHAR_CODE_LEFT_BRACKET = 91;
export const CHAR_CODE_1 = 49;
export const CHAR_CODE_2 = 50;
