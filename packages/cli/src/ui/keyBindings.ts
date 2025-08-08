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

  // Text input
  // Original: key.name === 'return' && !key.ctrl && !key.meta && !key.paste
  [Command.SUBMIT]: [
    {
      key: 'return',
      ctrl: false,
      command: false,
      paste: false,
    },
  ],
  // Original: key.name === 'return' && (key.ctrl || key.meta || key.paste)
  // Split into multiple data-driven bindings
  [Command.NEWLINE]: [
    { key: 'return', ctrl: true },
    { key: 'return', command: true },
    { key: 'return', paste: true },
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
  // Original: key.ctrl && key.name === 'e'
  [Command.TOGGLE_IDE_CONTEXT_DETAIL]: [{ key: 'e', ctrl: true }],
  // Original: key.ctrl && (key.name === 'c' || key.name === 'C')
  [Command.QUIT]: [
    { key: 'c', ctrl: true },
    { key: 'C', ctrl: true },
  ],
  // Original: key.ctrl && (key.name === 'd' || key.name === 'D')
  [Command.EXIT]: [
    { key: 'd', ctrl: true },
    { key: 'D', ctrl: true },
  ],
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

/**
 * Matches a KeyBinding against an actual Key press
 * Pure data-driven matching logic
 */
function matchKeyBinding(keyBinding: KeyBinding, key: Key): boolean {
  // Either key name or sequence must match (but not both should be defined)
  let keyMatches = false;

  if (keyBinding.key !== undefined) {
    keyMatches = keyBinding.key === key.name;
  } else if (keyBinding.sequence !== undefined) {
    keyMatches = keyBinding.sequence === key.sequence;
  } else {
    // Neither key nor sequence defined - invalid binding
    return false;
  }

  if (!keyMatches) {
    return false;
  }

  // Check modifiers - follow original logic:
  // undefined = ignore this modifier (original behavior)
  // true = modifier must be pressed
  // false = modifier must NOT be pressed

  if (keyBinding.ctrl !== undefined && key.ctrl !== keyBinding.ctrl) {
    return false;
  }

  if (keyBinding.shift !== undefined && key.shift !== keyBinding.shift) {
    return false;
  }

  if (keyBinding.command !== undefined && key.meta !== keyBinding.command) {
    return false;
  }

  if (keyBinding.paste !== undefined && key.paste !== keyBinding.paste) {
    return false;
  }

  return true;
}

/**
 * Checks if a key matches any of the bindings for a command
 */
function matchCommand(
  command: Command,
  key: Key,
  config: KeyBindingConfig = defaultKeyBindings,
): boolean {
  const bindings = config[command];
  return bindings.some((binding) => matchKeyBinding(binding, key));
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
 * Creates key matchers from a key binding configuration
 */
export function createKeyMatchers(
  config: KeyBindingConfig = defaultKeyBindings,
): KeyMatchers {
  const matchers = {} as { [C in Command]: KeyMatcher };

  for (const command of Object.values(Command)) {
    matchers[command] = (key: Key) => matchCommand(command, key, config);
  }

  return matchers as KeyMatchers;
}

/**
 * Default key binding matchers using the default configuration
 */
export const keyMatchers: KeyMatchers = createKeyMatchers(defaultKeyBindings);
