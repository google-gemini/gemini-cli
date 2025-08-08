/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { keyMatchers, Command } from './keyBindings.js';
import type { Key } from './hooks/useKeypress.js';

describe('keyBindings', () => {
  const key = (name: string, mods: Partial<Key> = {}): Key => ({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    paste: false,
    sequence: name,
    ...mods,
  });

  const testCases: Array<[string, Key, Command, boolean]> = [
    // [description, key, command, shouldMatch]
    ['ctrl+a matches home', key('a', { ctrl: true }), Command.HOME, true],
    ['ctrl+e matches end', key('e', { ctrl: true }), Command.END, true],
    ['ctrl+c matches quit', key('c', { ctrl: true }), Command.QUIT, true],
    ['ctrl+d matches exit', key('d', { ctrl: true }), Command.EXIT, true],
    ['enter matches submit', key('return'), Command.SUBMIT, true],
    [
      'ctrl+enter matches newline',
      key('return', { ctrl: true }),
      Command.NEWLINE,
      true,
    ],
    [
      'meta+enter matches newline',
      key('return', { meta: true }),
      Command.NEWLINE,
      true,
    ],
    [
      'paste+enter matches newline',
      key('return', { paste: true }),
      Command.NEWLINE,
      true,
    ],
    [
      'tab matches accept suggestion',
      key('tab'),
      Command.ACCEPT_SUGGESTION,
      true,
    ],
    [
      'enter matches accept suggestion',
      key('return'),
      Command.ACCEPT_SUGGESTION,
      true,
    ],
    ['escape matches escape', key('escape'), Command.ESCAPE, true],
    ['up matches navigation up', key('up'), Command.NAVIGATION_UP, true],
    [
      'down matches navigation down',
      key('down'),
      Command.NAVIGATION_DOWN,
      true,
    ],
    [
      'ctrl+p matches history up',
      key('p', { ctrl: true }),
      Command.HISTORY_UP,
      true,
    ],
    [
      'ctrl+n matches history down',
      key('n', { ctrl: true }),
      Command.HISTORY_DOWN,
      true,
    ],
    [
      'ctrl+k matches kill line right',
      key('k', { ctrl: true }),
      Command.KILL_LINE_RIGHT,
      true,
    ],
    [
      'ctrl+u matches kill line left',
      key('u', { ctrl: true }),
      Command.KILL_LINE_LEFT,
      true,
    ],
    [
      'ctrl+l matches clear screen',
      key('l', { ctrl: true }),
      Command.CLEAR_SCREEN,
      true,
    ],
    [
      'ctrl+o matches show error details',
      key('o', { ctrl: true }),
      Command.SHOW_ERROR_DETAILS,
      true,
    ],
    [
      'ctrl+t matches toggle tool descriptions',
      key('t', { ctrl: true }),
      Command.TOGGLE_TOOL_DESCRIPTIONS,
      true,
    ],
    [
      'ctrl+v matches paste clipboard image',
      key('v', { ctrl: true }),
      Command.PASTE_CLIPBOARD_IMAGE,
      true,
    ],
    [
      'ctrl+x matches open external editor',
      key('x', { ctrl: true }),
      Command.OPEN_EXTERNAL_EDITOR,
      true,
    ],

    // Negative cases
    ['plain a does not match home', key('a'), Command.HOME, false],
    [
      'ctrl+enter does not match submit',
      key('return', { ctrl: true }),
      Command.SUBMIT,
      false,
    ],
    [
      'meta+enter does not match submit',
      key('return', { meta: true }),
      Command.SUBMIT,
      false,
    ],
    [
      'paste+enter does not match submit',
      key('return', { paste: true }),
      Command.SUBMIT,
      false,
    ],
    [
      'plain enter does not match newline',
      key('return'),
      Command.NEWLINE,
      false,
    ],
    [
      'ctrl+enter does not match accept suggestion',
      key('return', { ctrl: true }),
      Command.ACCEPT_SUGGESTION,
      false,
    ],
  ];

  it('should have matchers for all commands', () => {
    Object.values(Command).forEach((command) => {
      expect(typeof keyMatchers[command]).toBe('function');
    });
  });

  testCases.forEach(([description, testKey, command, shouldMatch]) => {
    it(description, () => {
      expect(keyMatchers[command](testKey)).toBe(shouldMatch);
    });
  });
});
