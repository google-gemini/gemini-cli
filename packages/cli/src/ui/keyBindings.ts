/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from './hooks/useKeypress.js';

/**
 * Key matcher function type
 */
type KeyMatcher = (key: Key) => boolean;

/**
 * interface for key matchers
 */
export interface KeyMatchers {
  readonly [shortcutName: string]: KeyMatcher;
}

/**
 * key binding matchers
 */
export const keyMatchers: KeyMatchers = {
  // Cursor movement
  home: (key) => key.ctrl && key.name === 'a',
  end: (key) => key.ctrl && key.name === 'e',

  // Text deletion
  killLineRight: (key) => key.ctrl && key.name === 'k',
  killLineLeft: (key) => key.ctrl && key.name === 'u',
  clearInput: (key) => key.ctrl && key.name === 'c',

  // Screen control
  clearScreen: (key) => key.ctrl && key.name === 'l',

  // History navigation
  historyUp: (key) => key.ctrl && key.name === 'p',
  historyDown: (key) => key.ctrl && key.name === 'n',
  navigationUp: (key) => key.name === 'up',
  navigationDown: (key) => key.name === 'down',

  // Auto-completion
  acceptSuggestion: (key) =>
    key.name === 'tab' || (key.name === 'return' && !key.ctrl),
  escape: (key) => key.name === 'escape',

  // Text input
  submit: (key) =>
    key.name === 'return' && !key.ctrl && !key.meta && !key.paste,
  newline: (key) =>
    key.name === 'return' && (key.ctrl || key.meta || key.paste),

  // External tools
  openExternalEditor: (key) =>
    key.ctrl && (key.name === 'x' || key.sequence === '\x18'),
  pasteClipboardImage: (key) => key.ctrl && key.name === 'v',

  // App level bindings
  showErrorDetails: (key) => key.ctrl && key.name === 'o',
  toggleToolDescriptions: (key) => key.ctrl && key.name === 't',
  toggleIDEContextDetail: (key) => key.ctrl && key.name === 'e',
  quit: (key) => key.ctrl && (key.name === 'c' || key.name === 'C'),
  exit: (key) => key.ctrl && (key.name === 'd' || key.name === 'D'),
  showMoreLines: (key) => key.ctrl && key.name === 's',
};
