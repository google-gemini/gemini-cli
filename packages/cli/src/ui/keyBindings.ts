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

  // Screen control
  clearScreen: (key) => key.ctrl && key.name === 'l',

  // History navigation
  historyUp: (key) => key.ctrl && key.name === 'p',
  historyDown: (key) => key.ctrl && key.name === 'n',

  // App level bindings
  showErrorDetails: (key) => key.ctrl && key.name === 'o',
  toggleToolDescriptions: (key) => key.ctrl && key.name === 't',
  quit: (key) => key.ctrl && key.name === 'c',
  exit: (key) => key.ctrl && key.name === 'd',
  showMoreLines: (key) => key.ctrl && key.name === 's',
};
