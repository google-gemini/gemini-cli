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
  DELETE_WORD_BACKWARD = 'deleteWordBackward',

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
  TOGGLE_SHELL_INPUT_FOCUS = 'toggleShellInputFocus',

  // Suggestion expansion
  EXPAND_SUGGESTION = 'expandSuggestion',
  COLLAPSE_SUGGESTION = 'collapseSuggestion',
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
  [Command.ESCAPE]: [{ key: 'escape' }],

  // Cursor movement
  [Command.HOME]: [{ key: 'a', ctrl: true }],
  [Command.END]: [{ key: 'e', ctrl: true }],

  // Text deletion
  [Command.KILL_LINE_RIGHT]: [{ key: 'k', ctrl: true }],
  [Command.KILL_LINE_LEFT]: [{ key: 'u', ctrl: true }],
  [Command.CLEAR_INPUT]: [{ key: 'c', ctrl: true }],
  // Added command (meta/alt/option) for mac compatibility
  [Command.DELETE_WORD_BACKWARD]: [
    { key: 'backspace', ctrl: true },
    { key: 'backspace', command: true },
  ],

  // Screen control
  [Command.CLEAR_SCREEN]: [{ key: 'l', ctrl: true }],

  // History navigation
  [Command.HISTORY_UP]: [{ key: 'p', ctrl: true }],
  [Command.HISTORY_DOWN]: [{ key: 'n', ctrl: true }],
  [Command.NAVIGATION_UP]: [{ key: 'up' }],
  [Command.NAVIGATION_DOWN]: [{ key: 'down' }],

  // Auto-completion
  [Command.ACCEPT_SUGGESTION]: [{ key: 'tab' }, { key: 'return', ctrl: false }],
  // Completion navigation (arrow or Ctrl+P/N)
  [Command.COMPLETION_UP]: [{ key: 'up' }, { key: 'p', ctrl: true }],
  [Command.COMPLETION_DOWN]: [{ key: 'down' }, { key: 'n', ctrl: true }],

  // Text input
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
  [Command.OPEN_EXTERNAL_EDITOR]: [
    { key: 'x', ctrl: true },
    { sequence: '\x18', ctrl: true },
  ],
  [Command.PASTE_CLIPBOARD_IMAGE]: [{ key: 'v', ctrl: true }],

  // App level bindings
  [Command.SHOW_ERROR_DETAILS]: [{ key: 'o', ctrl: true }],
  [Command.TOGGLE_TOOL_DESCRIPTIONS]: [{ key: 't', ctrl: true }],
  [Command.TOGGLE_IDE_CONTEXT_DETAIL]: [{ key: 'g', ctrl: true }],
  [Command.QUIT]: [{ key: 'c', ctrl: true }],
  [Command.EXIT]: [{ key: 'd', ctrl: true }],
  [Command.SHOW_MORE_LINES]: [{ key: 's', ctrl: true }],

  // Shell commands
  [Command.REVERSE_SEARCH]: [{ key: 'r', ctrl: true }],
  // Note: original logic ONLY checked ctrl=false, ignored meta/shift/paste
  [Command.SUBMIT_REVERSE_SEARCH]: [{ key: 'return', ctrl: false }],
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: [{ key: 'tab' }],
  [Command.TOGGLE_SHELL_INPUT_FOCUS]: [{ key: 'f', ctrl: true }],

  // Suggestion expansion
  [Command.EXPAND_SUGGESTION]: [{ key: 'right' }],
  [Command.COLLAPSE_SUGGESTION]: [{ key: 'left' }],
};
