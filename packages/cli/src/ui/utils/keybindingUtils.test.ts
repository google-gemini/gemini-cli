/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatKeyBinding, formatCommand } from './keybindingUtils.js';
import { Command } from '../../config/keyBindings.js';
import type { KeyBinding } from '../../config/keyBindings.js';

describe('keybindingUtils', () => {
  describe('formatKeyBinding', () => {
    const testCases: Array<{
      name: string;
      binding: KeyBinding;
      expected: {
        darwin: string;
        win32: string;
        linux: string;
        default: string;
      };
    }> = [
      {
        name: 'simple key',
        binding: { key: 'a' },
        expected: { darwin: 'A', win32: 'A', linux: 'A', default: 'A' },
      },
      {
        name: 'named key (return)',
        binding: { key: 'return' },
        expected: {
          darwin: 'Enter',
          win32: 'Enter',
          linux: 'Enter',
          default: 'Enter',
        },
      },
      {
        name: 'named key (escape)',
        binding: { key: 'escape' },
        expected: { darwin: 'Esc', win32: 'Esc', linux: 'Esc', default: 'Esc' },
      },
      {
        name: 'ctrl modifier',
        binding: { key: 'c', ctrl: true },
        expected: {
          darwin: 'Ctrl+C',
          win32: 'Ctrl+C',
          linux: 'Ctrl+C',
          default: 'Ctrl+C',
        },
      },
      {
        name: 'cmd modifier',
        binding: { key: 'z', cmd: true },
        expected: {
          darwin: 'Cmd+Z',
          win32: 'Win+Z',
          linux: 'Super+Z',
          default: 'Cmd/Win+Z',
        },
      },
      {
        name: 'alt/option modifier',
        binding: { key: 'left', alt: true },
        expected: {
          darwin: 'Option+Left',
          win32: 'Alt+Left',
          linux: 'Alt+Left',
          default: 'Alt+Left',
        },
      },
      {
        name: 'shift modifier',
        binding: { key: 'up', shift: true },
        expected: {
          darwin: 'Shift+Up',
          win32: 'Shift+Up',
          linux: 'Shift+Up',
          default: 'Shift+Up',
        },
      },
      {
        name: 'multiple modifiers (ctrl+shift)',
        binding: { key: 'z', ctrl: true, shift: true },
        expected: {
          darwin: 'Ctrl+Shift+Z',
          win32: 'Ctrl+Shift+Z',
          linux: 'Ctrl+Shift+Z',
          default: 'Ctrl+Shift+Z',
        },
      },
      {
        name: 'all modifiers',
        binding: { key: 'a', ctrl: true, alt: true, shift: true, cmd: true },
        expected: {
          darwin: 'Ctrl+Option+Shift+Cmd+A',
          win32: 'Ctrl+Alt+Shift+Win+A',
          linux: 'Ctrl+Alt+Shift+Super+A',
          default: 'Ctrl+Alt+Shift+Cmd/Win+A',
        },
      },
    ];

    testCases.forEach(({ name, binding, expected }) => {
      describe(`${name}`, () => {
        it('formats correctly for darwin', () => {
          expect(formatKeyBinding(binding, 'darwin')).toBe(expected.darwin);
        });
        it('formats correctly for win32', () => {
          expect(formatKeyBinding(binding, 'win32')).toBe(expected.win32);
        });
        it('formats correctly for linux', () => {
          expect(formatKeyBinding(binding, 'linux')).toBe(expected.linux);
        });
        it('formats correctly for default', () => {
          expect(formatKeyBinding(binding, 'default')).toBe(expected.default);
        });
      });
    });
  });

  describe('formatCommand', () => {
    it('formats default commands (using default platform behavior)', () => {
      expect(formatCommand(Command.QUIT, undefined, 'default')).toBe('Ctrl+C');
      expect(formatCommand(Command.SUBMIT, undefined, 'default')).toBe('Enter');
      expect(
        formatCommand(Command.TOGGLE_BACKGROUND_SHELL, undefined, 'default'),
      ).toBe('Ctrl+B');
    });

    it('returns empty string for unknown commands', () => {
      expect(
        formatCommand(
          'unknown.command' as unknown as Command,
          undefined,
          'default',
        ),
      ).toBe('');
    });
  });
});
