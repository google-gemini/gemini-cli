/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { keyMatchers, Command, createKeyMatchers } from './keyMatchers.js';
import type { KeyBindingConfig } from '../config/keyBindings.js';
import { defaultKeyBindings } from '../config/keyBindings.js';
import type { Key } from './hooks/useKeypress.js';

describe('keyMatchers', () => {
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
  const originalMatchers: Record<Command, (key: Key) => boolean> = {
    [Command.RETURN]: (key: Key) => key.name === 'return',
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
    [Command.COMPLETION_UP]: (key: Key) =>
      key.name === 'up' || (key.ctrl && key.name === 'p'),
    [Command.COMPLETION_DOWN]: (key: Key) =>
      key.name === 'down' || (key.ctrl && key.name === 'n'),
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
      key.ctrl && key.name === 'g',
    [Command.QUIT]: (key: Key) => key.ctrl && key.name === 'c',
    [Command.EXIT]: (key: Key) => key.ctrl && key.name === 'd',
    [Command.SHOW_MORE_LINES]: (key: Key) => key.ctrl && key.name === 's',
    [Command.REVERSE_SEARCH]: (key: Key) => key.ctrl && key.name === 'r',
    [Command.SUBMIT_REVERSE_SEARCH]: (key: Key) =>
      key.name === 'return' && !key.ctrl,
    [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: (key: Key) =>
      key.name === 'tab',
  };

  // Test data for each command with positive and negative test cases
  const testCases = [
    // Basic bindings
    {
      command: Command.RETURN,
      positive: [createKey('return')],
      negative: [createKey('r')],
    },
    {
      command: Command.ESCAPE,
      positive: [createKey('escape'), createKey('escape', { ctrl: true })],
      negative: [createKey('e'), createKey('esc')],
    },

    // Cursor movement
    {
      command: Command.HOME,
      positive: [createKey('a', { ctrl: true })],
      negative: [
        createKey('a'),
        createKey('a', { shift: true }),
        createKey('b', { ctrl: true }),
      ],
    },
    {
      command: Command.END,
      positive: [createKey('e', { ctrl: true })],
      negative: [
        createKey('e'),
        createKey('e', { shift: true }),
        createKey('a', { ctrl: true }),
      ],
    },

    // Text deletion
    {
      command: Command.KILL_LINE_RIGHT,
      positive: [createKey('k', { ctrl: true })],
      negative: [createKey('k'), createKey('l', { ctrl: true })],
    },
    {
      command: Command.KILL_LINE_LEFT,
      positive: [createKey('u', { ctrl: true })],
      negative: [createKey('u'), createKey('k', { ctrl: true })],
    },
    {
      command: Command.CLEAR_INPUT,
      positive: [createKey('c', { ctrl: true })],
      negative: [createKey('c'), createKey('k', { ctrl: true })],
    },

    // Screen control
    {
      command: Command.CLEAR_SCREEN,
      positive: [createKey('l', { ctrl: true })],
      negative: [createKey('l'), createKey('k', { ctrl: true })],
    },

    // History navigation
    {
      command: Command.HISTORY_UP,
      positive: [createKey('p', { ctrl: true })],
      negative: [createKey('p'), createKey('up')],
    },
    {
      command: Command.HISTORY_DOWN,
      positive: [createKey('n', { ctrl: true })],
      negative: [createKey('n'), createKey('down')],
    },
    {
      command: Command.NAVIGATION_UP,
      positive: [createKey('up'), createKey('up', { ctrl: true })],
      negative: [createKey('p'), createKey('u')],
    },
    {
      command: Command.NAVIGATION_DOWN,
      positive: [createKey('down'), createKey('down', { ctrl: true })],
      negative: [createKey('n'), createKey('d')],
    },

    // Auto-completion
    {
      command: Command.ACCEPT_SUGGESTION,
      positive: [createKey('tab'), createKey('return')],
      negative: [createKey('return', { ctrl: true }), createKey('space')],
    },
    {
      command: Command.COMPLETION_UP,
      positive: [createKey('up'), createKey('p', { ctrl: true })],
      negative: [createKey('p'), createKey('down')],
    },
    {
      command: Command.COMPLETION_DOWN,
      positive: [createKey('down'), createKey('n', { ctrl: true })],
      negative: [createKey('n'), createKey('up')],
    },

    // Text input
    {
      command: Command.SUBMIT,
      positive: [createKey('return')],
      negative: [
        createKey('return', { ctrl: true }),
        createKey('return', { meta: true }),
        createKey('return', { paste: true }),
      ],
    },
    {
      command: Command.NEWLINE,
      positive: [
        createKey('return', { ctrl: true }),
        createKey('return', { meta: true }),
        createKey('return', { paste: true }),
      ],
      negative: [createKey('return'), createKey('n')],
    },

    // External tools
    {
      command: Command.OPEN_EXTERNAL_EDITOR,
      positive: [
        createKey('x', { ctrl: true }),
        { ...createKey('\x18'), sequence: '\x18', ctrl: true },
      ],
      negative: [createKey('x'), createKey('c', { ctrl: true })],
    },
    {
      command: Command.PASTE_CLIPBOARD_IMAGE,
      positive: [createKey('v', { ctrl: true })],
      negative: [createKey('v'), createKey('c', { ctrl: true })],
    },

    // App level bindings
    {
      command: Command.SHOW_ERROR_DETAILS,
      positive: [createKey('o', { ctrl: true })],
      negative: [createKey('o'), createKey('e', { ctrl: true })],
    },
    {
      command: Command.TOGGLE_TOOL_DESCRIPTIONS,
      positive: [createKey('t', { ctrl: true })],
      negative: [createKey('t'), createKey('s', { ctrl: true })],
    },
    {
      command: Command.TOGGLE_IDE_CONTEXT_DETAIL,
      positive: [createKey('g', { ctrl: true })],
      negative: [createKey('g'), createKey('t', { ctrl: true })],
    },
    {
      command: Command.QUIT,
      positive: [createKey('c', { ctrl: true })],
      negative: [createKey('c'), createKey('d', { ctrl: true })],
    },
    {
      command: Command.EXIT,
      positive: [createKey('d', { ctrl: true })],
      negative: [createKey('d'), createKey('c', { ctrl: true })],
    },
    {
      command: Command.SHOW_MORE_LINES,
      positive: [createKey('s', { ctrl: true })],
      negative: [createKey('s'), createKey('l', { ctrl: true })],
    },

    // Shell commands
    {
      command: Command.REVERSE_SEARCH,
      positive: [createKey('r', { ctrl: true })],
      negative: [createKey('r'), createKey('s', { ctrl: true })],
    },
    {
      command: Command.SUBMIT_REVERSE_SEARCH,
      positive: [createKey('return')],
      negative: [createKey('return', { ctrl: true }), createKey('tab')],
    },
    {
      command: Command.ACCEPT_SUGGESTION_REVERSE_SEARCH,
      positive: [createKey('tab'), createKey('tab', { ctrl: true })],
      negative: [createKey('return'), createKey('space')],
    },
  ];

  describe('Data-driven key binding matches original logic', () => {
    testCases.forEach(({ command, positive, negative }) => {
      it(`should match ${command} correctly`, () => {
        positive.forEach((key) => {
          expect(
            keyMatchers[command](key),
            `Expected ${command} to match ${JSON.stringify(key)}`,
          ).toBe(true);
          expect(
            originalMatchers[command](key),
            `Original matcher should also match ${JSON.stringify(key)}`,
          ).toBe(true);
        });

        negative.forEach((key) => {
          expect(
            keyMatchers[command](key),
            `Expected ${command} to NOT match ${JSON.stringify(key)}`,
          ).toBe(false);
          expect(
            originalMatchers[command](key),
            `Original matcher should also NOT match ${JSON.stringify(key)}`,
          ).toBe(false);
        });
      });
    });

    it('should properly handle ACCEPT_SUGGESTION_REVERSE_SEARCH cases', () => {
      expect(
        keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](
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
  });
});
