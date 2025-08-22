/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command enum for all available keyboard shortcuts
 */
export enum Command {
  // Basic bindings
  RETURN = 'return',
  ESCAPE = 'escape',

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
  COMPLETION_UP = 'completionUp',
  COMPLETION_DOWN = 'completionDown',

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
  SUBMIT_REVERSE_SEARCH = 'submitReverseSearch',
  ACCEPT_SUGGESTION_REVERSE_SEARCH = 'acceptSuggestionReverseSearch',
}

/**
 * Data-driven key binding structure for user configuration
 */
export interface KeyBinding {
  /** The key name (e.g., 'a', 'return', 'tab', 'escape') */
  key?: string;
  /** The key sequence (e.g., '\x18' for Ctrl+X) - alternative to key name */
  sequence?: string;
  /** Control key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  ctrl?: boolean;
  /** Shift key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  shift?: boolean;
  /** Command/meta key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  command?: boolean;
  /** Paste operation requirement: true=must be paste, false=must not be paste, undefined=ignore */
  paste?: boolean;
}

/**
 * Configuration type mapping commands to their key bindings
 */
export type KeyBindingConfig = {
  readonly [C in Command]: readonly KeyBinding[];
};

/**
 * Default key binding configuration
 * Matches the original hard-coded logic exactly
 */
export const defaultKeyBindings: KeyBindingConfig = {
  // Basic bindings
  [Command.RETURN]: [{ key: 'return' }],
  // Original: key.name === 'escape'
  [Command.ESCAPE]: [{ key: 'escape' }],

  // Cursor movement
  // Original: key.ctrl && key.name === 'a'
  [Command.HOME]: [{ key: 'a', ctrl: true }],
  // Original: key.ctrl && key.name === 'e'
  [Command.END]: [{ key: 'e', ctrl: true }],

  // Text deletion
  // Original: key.ctrl && key.name === 'k'
  [Command.KILL_LINE_RIGHT]: [{ key: 'k', ctrl: true }],
  // Original: key.ctrl && key.name === 'u'
  [Command.KILL_LINE_LEFT]: [{ key: 'u', ctrl: true }],
  // Original: key.ctrl && key.name === 'c'
  [Command.CLEAR_INPUT]: [{ key: 'c', ctrl: true }],

  // Screen control
  // Original: key.ctrl && key.name === 'l'
  [Command.CLEAR_SCREEN]: [{ key: 'l', ctrl: true }],

  // History navigation
  // Original: key.ctrl && key.name === 'p'
  [Command.HISTORY_UP]: [{ key: 'p', ctrl: true }],
  // Original: key.ctrl && key.name === 'n'
  [Command.HISTORY_DOWN]: [{ key: 'n', ctrl: true }],
  // Original: key.name === 'up'
  [Command.NAVIGATION_UP]: [{ key: 'up' }],
  // Original: key.name === 'down'
  [Command.NAVIGATION_DOWN]: [{ key: 'down' }],

  // Auto-completion
  // Original: key.name === 'tab' || (key.name === 'return' && !key.ctrl)
  [Command.ACCEPT_SUGGESTION]: [{ key: 'tab' }, { key: 'return', ctrl: false }],
  // Completion navigation (arrow or Ctrl+P/N)
  [Command.COMPLETION_UP]: [{ key: 'up' }, { key: 'p', ctrl: true }],
  [Command.COMPLETION_DOWN]: [{ key: 'down' }, { key: 'n', ctrl: true }],

  // Text input
  // Original: key.name === 'return' && !key.ctrl && !key.meta && !key.paste
  // Must also exclude shift to allow shift+enter for newline
  [Command.SUBMIT]: [
    {
      key: 'return',
      ctrl: false,
      command: false,
      paste: false,
      shift: false,
    },
  ],
  // Original: key.name === 'return' && (key.ctrl || key.meta || key.paste)
  // Split into multiple data-driven bindings
  // Now also includes shift+enter for multi-line input
  [Command.NEWLINE]: [
    { key: 'return', ctrl: true },
    { key: 'return', command: true },
    { key: 'return', paste: true },
    { key: 'return', shift: true },
    { key: 'j', ctrl: true },
  ],

  // External tools
  // Original: key.ctrl && (key.name === 'x' || key.sequence === '\x18')
  [Command.OPEN_EXTERNAL_EDITOR]: [
    { key: 'x', ctrl: true },
    { sequence: '\x18', ctrl: true },
  ],
  // Original: key.ctrl && key.name === 'v'
  [Command.PASTE_CLIPBOARD_IMAGE]: [{ key: 'v', ctrl: true }],

  // App level bindings
  // Original: key.ctrl && key.name === 'o'
  [Command.SHOW_ERROR_DETAILS]: [{ key: 'o', ctrl: true }],
  // Original: key.ctrl && key.name === 't'
  [Command.TOGGLE_TOOL_DESCRIPTIONS]: [{ key: 't', ctrl: true }],
  // Original: key.ctrl && key.name === 'g'
  [Command.TOGGLE_IDE_CONTEXT_DETAIL]: [{ key: 'g', ctrl: true }],
  // Original: key.ctrl && (key.name === 'c' || key.name === 'C')
  [Command.QUIT]: [{ key: 'c', ctrl: true }],
  // Original: key.ctrl && (key.name === 'd' || key.name === 'D')
  [Command.EXIT]: [{ key: 'd', ctrl: true }],
  // Original: key.ctrl && key.name === 's'
  [Command.SHOW_MORE_LINES]: [{ key: 's', ctrl: true }],

  // Shell commands
  // Original: key.ctrl && key.name === 'r'
  [Command.REVERSE_SEARCH]: [{ key: 'r', ctrl: true }],
  // Original: key.name === 'return' && !key.ctrl
  // Note: original logic ONLY checked ctrl=false, ignored meta/shift/paste
  [Command.SUBMIT_REVERSE_SEARCH]: [{ key: 'return', ctrl: false }],
  // Original: key.name === 'tab'
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: [{ key: 'tab' }],
};
