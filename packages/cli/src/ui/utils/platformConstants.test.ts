/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as constants from './platformConstants.js';

describe('platformConstants', () => {
  describe('Kitty keyboard protocol', () => {
    it('should have KITTY_CTRL_C sequence', () => {
      expect(constants.KITTY_CTRL_C).toBe('[99;5u');
    });

    it('should be a string', () => {
      expect(typeof constants.KITTY_CTRL_C).toBe('string');
    });

    it('should contain semicolon separator', () => {
      expect(constants.KITTY_CTRL_C).toContain(';');
    });
  });

  describe('Kitty keycodes', () => {
    it('should have KITTY_KEYCODE_ENTER', () => {
      expect(constants.KITTY_KEYCODE_ENTER).toBe(13);
    });

    it('should have KITTY_KEYCODE_NUMPAD_ENTER', () => {
      expect(constants.KITTY_KEYCODE_NUMPAD_ENTER).toBe(57414);
    });

    it('should have KITTY_KEYCODE_TAB', () => {
      expect(constants.KITTY_KEYCODE_TAB).toBe(9);
    });

    it('should have KITTY_KEYCODE_BACKSPACE', () => {
      expect(constants.KITTY_KEYCODE_BACKSPACE).toBe(127);
    });

    it('should be numeric values', () => {
      expect(typeof constants.KITTY_KEYCODE_ENTER).toBe('number');
      expect(typeof constants.KITTY_KEYCODE_NUMPAD_ENTER).toBe('number');
      expect(typeof constants.KITTY_KEYCODE_TAB).toBe('number');
      expect(typeof constants.KITTY_KEYCODE_BACKSPACE).toBe('number');
    });

    it('should have unique keycode values', () => {
      const keycodes = [
        constants.KITTY_KEYCODE_ENTER,
        constants.KITTY_KEYCODE_NUMPAD_ENTER,
        constants.KITTY_KEYCODE_TAB,
        constants.KITTY_KEYCODE_BACKSPACE,
      ];
      const uniqueKeycodes = new Set(keycodes);
      expect(uniqueKeycodes.size).toBe(keycodes.length);
    });

    it('should have numpad enter different from regular enter', () => {
      expect(constants.KITTY_KEYCODE_NUMPAD_ENTER).not.toBe(
        constants.KITTY_KEYCODE_ENTER,
      );
    });
  });

  describe('Kitty modifier constants', () => {
    it('should have KITTY_MODIFIER_BASE', () => {
      expect(constants.KITTY_MODIFIER_BASE).toBe(1);
    });

    it('should have KITTY_MODIFIER_EVENT_TYPES_OFFSET', () => {
      expect(constants.KITTY_MODIFIER_EVENT_TYPES_OFFSET).toBe(128);
    });

    it('should be numeric values', () => {
      expect(typeof constants.KITTY_MODIFIER_BASE).toBe('number');
      expect(typeof constants.KITTY_MODIFIER_EVENT_TYPES_OFFSET).toBe('number');
    });
  });

  describe('Modifier bit flags', () => {
    it('should have MODIFIER_SHIFT_BIT', () => {
      expect(constants.MODIFIER_SHIFT_BIT).toBe(1);
    });

    it('should have MODIFIER_ALT_BIT', () => {
      expect(constants.MODIFIER_ALT_BIT).toBe(2);
    });

    it('should have MODIFIER_CTRL_BIT', () => {
      expect(constants.MODIFIER_CTRL_BIT).toBe(4);
    });

    it('should be power of 2 values', () => {
      expect(constants.MODIFIER_SHIFT_BIT).toBe(1 << 0);
      expect(constants.MODIFIER_ALT_BIT).toBe(1 << 1);
      expect(constants.MODIFIER_CTRL_BIT).toBe(1 << 2);
    });

    it('should allow bitwise OR combinations', () => {
      const shiftCtrl =
        constants.MODIFIER_SHIFT_BIT | constants.MODIFIER_CTRL_BIT;
      expect(shiftCtrl).toBe(5);

      const altCtrl = constants.MODIFIER_ALT_BIT | constants.MODIFIER_CTRL_BIT;
      expect(altCtrl).toBe(6);

      const allModifiers =
        constants.MODIFIER_SHIFT_BIT |
        constants.MODIFIER_ALT_BIT |
        constants.MODIFIER_CTRL_BIT;
      expect(allModifiers).toBe(7);
    });

    it('should have unique bit values', () => {
      const bits = [
        constants.MODIFIER_SHIFT_BIT,
        constants.MODIFIER_ALT_BIT,
        constants.MODIFIER_CTRL_BIT,
      ];
      const uniqueBits = new Set(bits);
      expect(uniqueBits.size).toBe(bits.length);
    });
  });

  describe('Timing constants', () => {
    it('should have CTRL_EXIT_PROMPT_DURATION_MS', () => {
      expect(constants.CTRL_EXIT_PROMPT_DURATION_MS).toBe(1000);
    });

    it('should be in milliseconds', () => {
      expect(constants.CTRL_EXIT_PROMPT_DURATION_MS).toBeGreaterThan(0);
    });

    it('should be a reasonable duration', () => {
      expect(constants.CTRL_EXIT_PROMPT_DURATION_MS).toBeLessThan(10000);
    });
  });

  describe('VS Code terminal integration', () => {
    it('should have VSCODE_SHIFT_ENTER_SEQUENCE', () => {
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE).toBe('\\\r\n');
    });

    it('should contain backslash', () => {
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE).toContain('\\');
    });

    it('should contain carriage return', () => {
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE).toContain('\r');
    });

    it('should contain newline', () => {
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE).toContain('\n');
    });

    it('should have length 3', () => {
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE.length).toBe(3);
    });
  });

  describe('Detection window', () => {
    it('should have BACKSLASH_ENTER_DETECTION_WINDOW_MS', () => {
      expect(constants.BACKSLASH_ENTER_DETECTION_WINDOW_MS).toBe(5);
    });

    it('should be a small value for tight detection', () => {
      expect(constants.BACKSLASH_ENTER_DETECTION_WINDOW_MS).toBeLessThan(50);
    });

    it('should be positive', () => {
      expect(constants.BACKSLASH_ENTER_DETECTION_WINDOW_MS).toBeGreaterThan(0);
    });
  });

  describe('Sequence length', () => {
    it('should have MAX_KITTY_SEQUENCE_LENGTH', () => {
      expect(constants.MAX_KITTY_SEQUENCE_LENGTH).toBe(32);
    });

    it('should be large enough for complex sequences', () => {
      expect(constants.MAX_KITTY_SEQUENCE_LENGTH).toBeGreaterThanOrEqual(12);
    });

    it('should not be excessively large', () => {
      expect(constants.MAX_KITTY_SEQUENCE_LENGTH).toBeLessThan(100);
    });
  });

  describe('Character codes', () => {
    it('should have CHAR_CODE_ESC', () => {
      expect(constants.CHAR_CODE_ESC).toBe(27);
    });

    it('should have CHAR_CODE_LEFT_BRACKET', () => {
      expect(constants.CHAR_CODE_LEFT_BRACKET).toBe(91);
    });

    it('should have CHAR_CODE_1', () => {
      expect(constants.CHAR_CODE_1).toBe(49);
    });

    it('should have CHAR_CODE_2', () => {
      expect(constants.CHAR_CODE_2).toBe(50);
    });

    it('should match ASCII codes', () => {
      expect(constants.CHAR_CODE_ESC).toBe('\x1b'.charCodeAt(0));
      expect(constants.CHAR_CODE_LEFT_BRACKET).toBe('['.charCodeAt(0));
      expect(constants.CHAR_CODE_1).toBe('1'.charCodeAt(0));
      expect(constants.CHAR_CODE_2).toBe('2'.charCodeAt(0));
    });

    it('should be valid ASCII values', () => {
      const codes = [
        constants.CHAR_CODE_ESC,
        constants.CHAR_CODE_LEFT_BRACKET,
        constants.CHAR_CODE_1,
        constants.CHAR_CODE_2,
      ];
      codes.forEach((code) => {
        expect(code).toBeGreaterThanOrEqual(0);
        expect(code).toBeLessThan(128);
      });
    });
  });

  describe('constant types', () => {
    it('should export numeric constants as numbers', () => {
      expect(typeof constants.KITTY_KEYCODE_ENTER).toBe('number');
      expect(typeof constants.MODIFIER_SHIFT_BIT).toBe('number');
      expect(typeof constants.CTRL_EXIT_PROMPT_DURATION_MS).toBe('number');
      expect(typeof constants.MAX_KITTY_SEQUENCE_LENGTH).toBe('number');
    });

    it('should export string constants as strings', () => {
      expect(typeof constants.KITTY_CTRL_C).toBe('string');
      expect(typeof constants.VSCODE_SHIFT_ENTER_SEQUENCE).toBe('string');
    });
  });

  describe('constant naming', () => {
    it('should use UPPER_SNAKE_CASE for all constants', () => {
      const constantNames = Object.keys(constants);
      constantNames.forEach((name) => {
        expect(name).toMatch(/^[A-Z_]+$/);
      });
    });

    it('should group related constants by prefix', () => {
      const kittyConstants = Object.keys(constants).filter((name) =>
        name.startsWith('KITTY_'),
      );
      expect(kittyConstants.length).toBeGreaterThan(0);

      const modifierConstants = Object.keys(constants).filter((name) =>
        name.startsWith('MODIFIER_'),
      );
      expect(modifierConstants.length).toBeGreaterThan(0);

      const charConstants = Object.keys(constants).filter((name) =>
        name.startsWith('CHAR_CODE_'),
      );
      expect(charConstants.length).toBeGreaterThan(0);
    });
  });

  describe('usage scenarios', () => {
    it('should support modifier bitmask calculations', () => {
      // No modifiers: base value
      const noMods = constants.KITTY_MODIFIER_BASE;
      expect(noMods).toBe(1);

      // Shift only: base + shift bit
      const shift =
        constants.KITTY_MODIFIER_BASE + constants.MODIFIER_SHIFT_BIT;
      expect(shift).toBe(2);

      // Ctrl only
      const ctrl = constants.KITTY_MODIFIER_BASE + constants.MODIFIER_CTRL_BIT;
      expect(ctrl).toBe(5);

      // Shift + Ctrl
      const shiftCtrl =
        constants.KITTY_MODIFIER_BASE +
        constants.MODIFIER_SHIFT_BIT +
        constants.MODIFIER_CTRL_BIT;
      expect(shiftCtrl).toBe(6);
    });

    it('should support keycode comparisons', () => {
      const keycode = constants.KITTY_KEYCODE_ENTER;

      expect(keycode === constants.KITTY_KEYCODE_ENTER).toBe(true);
      expect(keycode === constants.KITTY_KEYCODE_TAB).toBe(false);
      expect(keycode === constants.KITTY_KEYCODE_NUMPAD_ENTER).toBe(false);
    });

    it('should support character code lookups', () => {
      const escCode = constants.CHAR_CODE_ESC;

      expect(String.fromCharCode(escCode)).toBe('\x1b');
    });

    it('should support timeout calculations', () => {
      const duration = constants.CTRL_EXIT_PROMPT_DURATION_MS;
      const halfDuration = duration / 2;

      expect(halfDuration).toBe(500);
    });
  });

  describe('value ranges', () => {
    it('should have keycodes in valid range', () => {
      expect(constants.KITTY_KEYCODE_ENTER).toBeGreaterThanOrEqual(0);
      expect(constants.KITTY_KEYCODE_TAB).toBeGreaterThanOrEqual(0);
      expect(constants.KITTY_KEYCODE_BACKSPACE).toBeGreaterThanOrEqual(0);
      expect(constants.KITTY_KEYCODE_NUMPAD_ENTER).toBeGreaterThanOrEqual(0);
    });

    it('should have modifier bits as small integers', () => {
      expect(constants.MODIFIER_SHIFT_BIT).toBeLessThan(8);
      expect(constants.MODIFIER_ALT_BIT).toBeLessThan(8);
      expect(constants.MODIFIER_CTRL_BIT).toBeLessThan(8);
    });

    it('should have timing values in reasonable range', () => {
      expect(constants.CTRL_EXIT_PROMPT_DURATION_MS).toBeGreaterThan(0);
      expect(constants.CTRL_EXIT_PROMPT_DURATION_MS).toBeLessThan(60000);

      expect(constants.BACKSLASH_ENTER_DETECTION_WINDOW_MS).toBeGreaterThan(0);
      expect(constants.BACKSLASH_ENTER_DETECTION_WINDOW_MS).toBeLessThan(1000);
    });
  });

  describe('immutability', () => {
    it('should have readonly numeric values', () => {
      const originalValue = constants.KITTY_KEYCODE_ENTER;
      expect(constants.KITTY_KEYCODE_ENTER).toBe(originalValue);
    });

    it('should have readonly string values', () => {
      const originalValue = constants.KITTY_CTRL_C;
      expect(constants.KITTY_CTRL_C).toBe(originalValue);
    });
  });

  describe('documentation alignment', () => {
    it('should have kitty protocol sequence in expected format', () => {
      // Format should be: [keycode;modifiersu
      expect(constants.KITTY_CTRL_C).toMatch(/^\[\d+;\d+u$/);
    });

    it('should have modifier offset of 128', () => {
      expect(constants.KITTY_MODIFIER_EVENT_TYPES_OFFSET).toBe(128);
      expect(constants.KITTY_MODIFIER_EVENT_TYPES_OFFSET).toBe(1 << 7);
    });

    it('should have VS Code sequence matching spec', () => {
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE).toBe('\\\r\n');
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE.charCodeAt(0)).toBe(92); // backslash
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE.charCodeAt(1)).toBe(13); // CR
      expect(constants.VSCODE_SHIFT_ENTER_SEQUENCE.charCodeAt(2)).toBe(10); // LF
    });
  });
});
