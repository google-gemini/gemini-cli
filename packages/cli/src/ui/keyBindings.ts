/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from './hooks/useKeypress.js';

/**
 * Command enum for all available keyboard shortcuts
 */
export enum Command {
  // Cursor movement
  HOME = 'home',
  END = 'end',

  // Text deletion
  KILL_LINE_RIGHT = 'killLineRight',
  KILL_LINE_LEFT = 'killLineLeft',
  CLEAR_INPUT = 'clearInput',

  // Screen control
  CLEAR_SCREEN = 'clearScreen',

  // History navigation
  HISTORY_UP = 'historyUp',
  HISTORY_DOWN = 'historyDown',
  NAVIGATION_UP = 'navigationUp',
  NAVIGATION_DOWN = 'navigationDown',

  // Auto-completion
  ACCEPT_SUGGESTION = 'acceptSuggestion',
  ESCAPE = 'escape',

  // Text input
  SUBMIT = 'submit',
  NEWLINE = 'newline',

  // External tools
  OPEN_EXTERNAL_EDITOR = 'openExternalEditor',
  PASTE_CLIPBOARD_IMAGE = 'pasteClipboardImage',

  // App level bindings
  SHOW_ERROR_DETAILS = 'showErrorDetails',
  TOGGLE_TOOL_DESCRIPTIONS = 'toggleToolDescriptions',
  TOGGLE_IDE_CONTEXT_DETAIL = 'toggleIDEContextDetail',
  QUIT = 'quit',
  EXIT = 'exit',
  SHOW_MORE_LINES = 'showMoreLines',

  // Shell commands
  REVERSE_SEARCH = 'reverseSearch',
}

/**
 * Key matcher function type
 */
type KeyMatcher = (key: Key) => boolean;

/**
 * Type for key matchers mapped to Command enum
 */
export type KeyMatchers = {
  readonly [C in Command]: KeyMatcher;
};

/**
 * key binding matchers
 */
export const keyMatchers: KeyMatchers = {
  // Cursor movement
  [Command.HOME]: (key) => key.ctrl && key.name === 'a',
  [Command.END]: (key) => key.ctrl && key.name === 'e',

  // Text deletion
  [Command.KILL_LINE_RIGHT]: (key) => key.ctrl && key.name === 'k',
  [Command.KILL_LINE_LEFT]: (key) => key.ctrl && key.name === 'u',
  [Command.CLEAR_INPUT]: (key) => key.ctrl && key.name === 'c',

  // Screen control
  [Command.CLEAR_SCREEN]: (key) => key.ctrl && key.name === 'l',

  // History navigation
  [Command.HISTORY_UP]: (key) => key.ctrl && key.name === 'p',
  [Command.HISTORY_DOWN]: (key) => key.ctrl && key.name === 'n',
  [Command.NAVIGATION_UP]: (key) => key.name === 'up',
  [Command.NAVIGATION_DOWN]: (key) => key.name === 'down',

  // Auto-completion
  [Command.ACCEPT_SUGGESTION]: (key) =>
    key.name === 'tab' || (key.name === 'return' && !key.ctrl),
  [Command.ESCAPE]: (key) => key.name === 'escape',

  // Text input
  [Command.SUBMIT]: (key) =>
    key.name === 'return' && !key.ctrl && !key.meta && !key.paste,
  [Command.NEWLINE]: (key) =>
    key.name === 'return' && (key.ctrl || key.meta || key.paste),

  // External tools
  [Command.OPEN_EXTERNAL_EDITOR]: (key) =>
    key.ctrl && (key.name === 'x' || key.sequence === '\x18'),
  [Command.PASTE_CLIPBOARD_IMAGE]: (key) => key.ctrl && key.name === 'v',

  // App level bindings
  [Command.SHOW_ERROR_DETAILS]: (key) => key.ctrl && key.name === 'o',
  [Command.TOGGLE_TOOL_DESCRIPTIONS]: (key) => key.ctrl && key.name === 't',
  [Command.TOGGLE_IDE_CONTEXT_DETAIL]: (key) => key.ctrl && key.name === 'e',
  [Command.QUIT]: (key) => key.ctrl && (key.name === 'c' || key.name === 'C'),
  [Command.EXIT]: (key) => key.ctrl && (key.name === 'd' || key.name === 'D'),
  [Command.SHOW_MORE_LINES]: (key) => key.ctrl && key.name === 's',

  // Shell commands
  [Command.REVERSE_SEARCH]: (key) => key.ctrl && key.name === 'r',
};
