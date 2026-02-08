/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatKeyBinding, formatCommand } from './keybindingUtils.js';
import { Command } from '../../config/keyBindings.js';

describe('keybindingUtils', () => {
  describe('formatKeyBinding', () => {
    it('formats simple keys', () => {
      expect(formatKeyBinding({ key: 'a' })).toBe('A');
      expect(formatKeyBinding({ key: 'return' })).toBe('Enter');
      expect(formatKeyBinding({ key: 'escape' })).toBe('Esc');
    });

    it('formats modifiers', () => {
      expect(formatKeyBinding({ key: 'c', ctrl: true })).toBe('Ctrl+C');
      expect(formatKeyBinding({ key: 'z', cmd: true })).toBe('Cmd+Z');
      expect(formatKeyBinding({ key: 'up', shift: true })).toBe('Shift+Up');
      expect(formatKeyBinding({ key: 'left', alt: true })).toBe('Alt+Left');
    });

    it('formats multiple modifiers in order', () => {
      expect(formatKeyBinding({ key: 'z', ctrl: true, shift: true })).toBe(
        'Ctrl+Shift+Z',
      );
      expect(
        formatKeyBinding({
          key: 'a',
          ctrl: true,
          alt: true,
          shift: true,
          cmd: true,
        }),
      ).toBe('Ctrl+Alt+Shift+Cmd+A');
    });
  });

  describe('formatCommand', () => {
    it('formats default commands', () => {
      expect(formatCommand(Command.QUIT)).toBe('Ctrl+C');
      expect(formatCommand(Command.SUBMIT)).toBe('Enter');
      expect(formatCommand(Command.TOGGLE_BACKGROUND_SHELL)).toBe('Ctrl+B');
    });

    it('returns empty string for unknown commands', () => {
      expect(formatCommand('unknown.command' as unknown as Command)).toBe('');
    });
  });
});
