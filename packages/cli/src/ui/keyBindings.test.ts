/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  keyMatchers,
  Command,
  KeyBindingConfig,
  createKeyMatchers,
  defaultKeyBindings,
} from './keyBindings.js';
import type { Key } from './hooks/useKeypress.js';

describe('keyBindings', () => {
  const createKey = (name: string, mods: Partial<Key> = {}): Key => ({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    paste: false,
    sequence: name,
    ...mods,
  });

  // Original hard-coded logic (for comparison)
  const originalMatchers = {
    [Command.HOME]: (key: Key) => key.ctrl && key.name === 'a',
    [Command.END]: (key: Key) => key.ctrl && key.name === 'e',
    [Command.KILL_LINE_RIGHT]: (key: Key) => key.ctrl && key.name === 'k',
    [Command.KILL_LINE_LEFT]: (key: Key) => key.ctrl && key.name === 'u',
    [Command.CLEAR_INPUT]: (key: Key) => key.ctrl && key.name === 'c',
    [Command.CLEAR_SCREEN]: (key: Key) => key.ctrl && key.name === 'l',
    [Command.HISTORY_UP]: (key: Key) => key.ctrl && key.name === 'p',
    [Command.HISTORY_DOWN]: (key: Key) => key.ctrl && key.name === 'n',
    [Command.NAVIGATION_UP]: (key: Key) => key.name === 'up',
    [Command.NAVIGATION_DOWN]: (key: Key) => key.name === 'down',
    [Command.ACCEPT_SUGGESTION]: (key: Key) =>
      key.name === 'tab' || (key.name === 'return' && !key.ctrl),
    [Command.ESCAPE]: (key: Key) => key.name === 'escape',
    [Command.SUBMIT]: (key: Key) =>
      key.name === 'return' && !key.ctrl && !key.meta && !key.paste,
    [Command.NEWLINE]: (key: Key) =>
      key.name === 'return' && (key.ctrl || key.meta || key.paste),
    [Command.OPEN_EXTERNAL_EDITOR]: (key: Key) =>
      key.ctrl && (key.name === 'x' || key.sequence === '\x18'),
    [Command.PASTE_CLIPBOARD_IMAGE]: (key: Key) => key.ctrl && key.name === 'v',
    [Command.SHOW_ERROR_DETAILS]: (key: Key) => key.ctrl && key.name === 'o',
    [Command.TOGGLE_TOOL_DESCRIPTIONS]: (key: Key) =>
      key.ctrl && key.name === 't',
    [Command.TOGGLE_IDE_CONTEXT_DETAIL]: (key: Key) =>
      key.ctrl && key.name === 'e',
    [Command.QUIT]: (key: Key) =>
      key.ctrl && (key.name === 'c' || key.name === 'C'),
    [Command.EXIT]: (key: Key) =>
      key.ctrl && (key.name === 'd' || key.name === 'D'),
    [Command.SHOW_MORE_LINES]: (key: Key) => key.ctrl && key.name === 's',
    [Command.REVERSE_SEARCH]: (key: Key) => key.ctrl && key.name === 'r',
    // Missing commands that were not in original logic but exist in new system
    [Command.RETURN]: (key: Key) => key.name === 'return',
    [Command.SUBMIT_REVERSE_SEARCH]: (key: Key) =>
      key.name === 'return' && !key.ctrl,
    [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: (key: Key) =>
      key.name === 'tab',
  };

  describe('Complete compatibility with original logic', () => {
    // Test various key combinations to ensure 100% compatibility with original logic
    const testKeys = [
      // Basic cases
      createKey('a', { ctrl: true }),
      createKey('a', { ctrl: true, shift: true }),
      createKey('a'),
      createKey('escape'),
      createKey('escape', { ctrl: true }),
      createKey('escape', { shift: true, meta: true }),
      createKey('return'),
      createKey('return', { ctrl: true }),
      createKey('return', { meta: true }),
      createKey('return', { paste: true }),
      createKey('return', { shift: true }),
      createKey('return', { ctrl: true, meta: true }),
      createKey('tab'),
      createKey('tab', { ctrl: true }),
      createKey('up'),
      createKey('down', { shift: true }),
      createKey('x', { ctrl: true }),
      createKey('unknown', { ctrl: true, sequence: '\x18' }),
      createKey('c', { ctrl: true }),
      createKey('C', { ctrl: true }),
      createKey('d', { ctrl: true }),
      createKey('D', { ctrl: true }),
      createKey('o', { ctrl: true, shift: true }),
      createKey('t', { ctrl: true, meta: true }),
    ];

    Object.entries(originalMatchers).forEach(([command, originalMatcher]) => {
      it(`${command} should match original logic exactly`, () => {
        testKeys.forEach((testKey) => {
          const originalResult = originalMatcher(testKey);
          const newResult = keyMatchers[command as Command](testKey);

          expect(newResult).toBe(originalResult);
        });
      });
    });
  });

  describe('Basic functionality', () => {
    it('should have matchers for all commands', () => {
      Object.values(Command).forEach((command) => {
        expect(typeof keyMatchers[command]).toBe('function');
      });
    });

    it('should work with default key bindings', () => {
      // Test main cases simply
      expect(keyMatchers[Command.HOME](createKey('a', { ctrl: true }))).toBe(
        true,
      );
      expect(keyMatchers[Command.SUBMIT](createKey('return'))).toBe(true);
      expect(
        keyMatchers[Command.NEWLINE](createKey('return', { ctrl: true })),
      ).toBe(true);
      expect(keyMatchers[Command.ESCAPE](createKey('escape'))).toBe(true);
      expect(
        keyMatchers[Command.ESCAPE](createKey('escape', { shift: true })),
      ).toBe(true); // modifiers ignored
      expect(keyMatchers[Command.QUIT](createKey('c', { ctrl: true }))).toBe(
        true,
      );
      expect(keyMatchers[Command.QUIT](createKey('C', { ctrl: true }))).toBe(
        true,
      );

      // Test new commands added to the system
      expect(keyMatchers[Command.RETURN](createKey('return'))).toBe(true);
      expect(
        keyMatchers[Command.RETURN](createKey('return', { ctrl: true })),
      ).toBe(true); // modifiers ignored
      expect(
        keyMatchers[Command.SUBMIT_REVERSE_SEARCH](createKey('return')),
      ).toBe(true);
      expect(
        keyMatchers[Command.SUBMIT_REVERSE_SEARCH](
          createKey('return', { ctrl: true }),
        ),
      ).toBe(false); // ctrl must be false
      expect(
        keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](createKey('tab')),
      ).toBe(true);
      expect(
        keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](
          createKey('tab', { ctrl: true }),
        ),
      ).toBe(true); // modifiers ignored
    });
  });

  describe('Custom key bindings', () => {
    it('should work with custom configuration', () => {
      const customConfig: KeyBindingConfig = {
        ...defaultKeyBindings,
        [Command.HOME]: [{ key: 'h', ctrl: true }, { key: '0' }],
      };

      const customMatchers = createKeyMatchers(customConfig);

      expect(customMatchers[Command.HOME](createKey('h', { ctrl: true }))).toBe(
        true,
      );
      expect(customMatchers[Command.HOME](createKey('0'))).toBe(true);
      expect(customMatchers[Command.HOME](createKey('a', { ctrl: true }))).toBe(
        false,
      );
    });

    it('should support multiple key bindings for same command', () => {
      const config: KeyBindingConfig = {
        ...defaultKeyBindings,
        [Command.QUIT]: [
          { key: 'q', ctrl: true },
          { key: 'q', command: true },
        ],
      };

      const matchers = createKeyMatchers(config);
      expect(matchers[Command.QUIT](createKey('q', { ctrl: true }))).toBe(true);
      expect(matchers[Command.QUIT](createKey('q', { meta: true }))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty binding arrays', () => {
      const config: KeyBindingConfig = {
        ...defaultKeyBindings,
        [Command.HOME]: [],
      };

      const matchers = createKeyMatchers(config);
      expect(matchers[Command.HOME](createKey('a', { ctrl: true }))).toBe(
        false,
      );
    });

    it('should handle case sensitivity', () => {
      const config: KeyBindingConfig = {
        ...defaultKeyBindings,
        [Command.QUIT]: [{ key: 'Q', ctrl: true }],
      };

      const matchers = createKeyMatchers(config);
      expect(matchers[Command.QUIT](createKey('Q', { ctrl: true }))).toBe(true);
      expect(matchers[Command.QUIT](createKey('q', { ctrl: true }))).toBe(
        false,
      );
    });
  });
});
