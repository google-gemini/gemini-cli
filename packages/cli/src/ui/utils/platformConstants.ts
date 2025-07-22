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
 * Various newline sequences supported across different platforms and terminals.
 * Used to detect when the user wants to submit input vs create a new line.
 */
export const NEWLINE_INPUT_SEQUENCES = [
  '\n', // Unix-style newline (LF)
  '\r\n', // Windows-style newline (CRLF)
  '\\\r', // VSCode terminal's representation of Shift+Enter
  '\x1b[13;2u', // Kitty Protocol: Shift+Enter
  '\x1b[13;5u', // Kitty Protocol: Ctrl+Enter
] as const;

/**
 * Timing constants for terminal interactions
 */
export const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

/**
 * VS Code terminal integration constants
 */
export const VSCODE_SHIFT_ENTER_SEQUENCE = '\\\r\n';
