/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { keyToAnsi, type Key } from './keyToAnsi.js';

describe('keyToAnsi', () => {
  describe('Ctrl + letter combinations', () => {
    it('should convert Ctrl+A to \\x01', () => {
      const key: Key = {
        name: 'a',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);

      expect(result).toBe('\x01');
    });

    it('should convert Ctrl+B to \\x02', () => {
      const key: Key = {
        name: 'b',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x02');
    });

    it('should convert Ctrl+C to \\x03', () => {
      const key: Key = {
        name: 'c',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x03');
    });

    it('should convert Ctrl+D to \\x04', () => {
      const key: Key = {
        name: 'd',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x04');
    });

    it('should convert Ctrl+Z to \\x1a', () => {
      const key: Key = {
        name: 'z',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x1a');
    });

    it('should handle all lowercase letters a-z', () => {
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode('a'.charCodeAt(0) + i);
        const key: Key = {
          name: letter,
          ctrl: true,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        };

        const result = keyToAnsi(key);
        const expectedCode = String.fromCharCode(i + 1);

        expect(result).toBe(expectedCode);
      }
    });
  });

  describe('arrow keys', () => {
    it('should convert up arrow to ANSI sequence', () => {
      const key: Key = {
        name: 'up',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[A');
    });

    it('should convert down arrow to ANSI sequence', () => {
      const key: Key = {
        name: 'down',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[B');
    });

    it('should convert right arrow to ANSI sequence', () => {
      const key: Key = {
        name: 'right',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[C');
    });

    it('should convert left arrow to ANSI sequence', () => {
      const key: Key = {
        name: 'left',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[D');
    });
  });

  describe('special keys', () => {
    it('should convert escape key', () => {
      const key: Key = {
        name: 'escape',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b');
    });

    it('should convert tab key', () => {
      const key: Key = {
        name: 'tab',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\t');
    });

    it('should convert backspace key', () => {
      const key: Key = {
        name: 'backspace',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x7f');
    });

    it('should convert delete key', () => {
      const key: Key = {
        name: 'delete',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[3~');
    });

    it('should convert home key', () => {
      const key: Key = {
        name: 'home',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[H');
    });

    it('should convert end key', () => {
      const key: Key = {
        name: 'end',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[F');
    });

    it('should convert pageup key', () => {
      const key: Key = {
        name: 'pageup',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[5~');
    });

    it('should convert pagedown key', () => {
      const key: Key = {
        name: 'pagedown',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[6~');
    });
  });

  describe('return key', () => {
    it('should convert return to carriage return', () => {
      const key: Key = {
        name: 'return',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\r');
    });

    it('should handle return with shift', () => {
      const key: Key = {
        name: 'return',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\r');
    });
  });

  describe('simple character keys', () => {
    it('should return sequence for simple letter', () => {
      const key: Key = {
        name: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'a',
      };

      expect(keyToAnsi(key)).toBe('a');
    });

    it('should return sequence for uppercase letter', () => {
      const key: Key = {
        name: 'A',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
        sequence: 'A',
      };

      expect(keyToAnsi(key)).toBe('A');
    });

    it('should return sequence for digit', () => {
      const key: Key = {
        name: '5',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '5',
      };

      expect(keyToAnsi(key)).toBe('5');
    });

    it('should return sequence for space', () => {
      const key: Key = {
        name: 'space',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: ' ',
      };

      expect(keyToAnsi(key)).toBe(' ');
    });

    it('should return sequence for punctuation', () => {
      const key: Key = {
        name: '!',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '!',
      };

      expect(keyToAnsi(key)).toBe('!');
    });

    it('should handle multiple character sequences', () => {
      const key: Key = {
        name: 'test',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'abc',
      };

      expect(keyToAnsi(key)).toBe('abc');
    });
  });

  describe('null returns', () => {
    it('should return null for unmapped key name', () => {
      const key: Key = {
        name: 'unknown',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBeNull();
    });

    it('should return null for key with meta modifier', () => {
      const key: Key = {
        name: 'a',
        ctrl: false,
        meta: true,
        shift: false,
        paste: false,
        sequence: 'a',
      };

      expect(keyToAnsi(key)).toBeNull();
    });

    it('should return null for ctrl+meta combination', () => {
      const key: Key = {
        name: 'a',
        ctrl: true,
        meta: true,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBeNull();
    });

    it('should return null for unmapped key without sequence', () => {
      const key: Key = {
        name: 'f1',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBeNull();
    });

    it('should return null for ctrl with uppercase letter', () => {
      const key: Key = {
        name: 'A',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBeNull();
    });

    it('should return null for ctrl with non-letter', () => {
      const key: Key = {
        name: '1',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty sequence with no modifiers', () => {
      const key: Key = {
        name: 'unknown',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBeNull();
    });

    it('should prioritize return over sequence', () => {
      const key: Key = {
        name: 'return',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'should-not-be-used',
      };

      expect(keyToAnsi(key)).toBe('\r');
    });

    it('should prioritize arrow keys over sequence', () => {
      const key: Key = {
        name: 'up',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'should-not-be-used',
      };

       
      expect(keyToAnsi(key)).toBe('\x1b[A');
    });

    it('should handle shift with simple character', () => {
      const key: Key = {
        name: 'A',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
        sequence: 'A',
      };

      expect(keyToAnsi(key)).toBe('A');
    });

    it('should handle paste flag with simple character', () => {
      const key: Key = {
        name: 'text',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        sequence: 'pasted text',
      };

      expect(keyToAnsi(key)).toBe('pasted text');
    });

    it('should handle kittyProtocol flag', () => {
      const key: Key = {
        name: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'a',
        kittyProtocol: true,
      };

      expect(keyToAnsi(key)).toBe('a');
    });
  });

  describe('character code validation', () => {
    it('should produce correct ASCII control codes for ctrl+letters', () => {
      const key: Key = {
        name: 'g',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result?.charCodeAt(0)).toBe(7); // Ctrl+G = Bell
    });

    it('should produce correct code for backspace', () => {
      const key: Key = {
        name: 'backspace',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result?.charCodeAt(0)).toBe(127); // DEL character
    });

    it('should produce correct code for tab', () => {
      const key: Key = {
        name: 'tab',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result?.charCodeAt(0)).toBe(9); // Tab character
    });

    it('should produce correct code for escape', () => {
      const key: Key = {
        name: 'escape',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result?.charCodeAt(0)).toBe(27); // ESC character
    });
  });

  describe('ANSI sequence structure', () => {
    it('should start arrow sequences with ESC', () => {
      const keys = ['up', 'down', 'left', 'right'];

      for (const name of keys) {
        const key: Key = {
          name,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        };

        const result = keyToAnsi(key);
        expect(result?.charCodeAt(0)).toBe(27); // ESC
      }
    });

    it('should start special key sequences with ESC', () => {
      const keys = ['delete', 'home', 'end', 'pageup', 'pagedown'];

      for (const name of keys) {
        const key: Key = {
          name,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '',
        };

        const result = keyToAnsi(key);
        expect(result?.charCodeAt(0)).toBe(27); // ESC
      }
    });

    it('should have proper length for arrow sequences', () => {
      const key: Key = {
        name: 'up',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result?.length).toBe(3); // \x1b[A
    });

    it('should have proper length for delete sequence', () => {
      const key: Key = {
        name: 'delete',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result?.length).toBe(4); // \x1b[3~
    });
  });

  describe('type exports', () => {
    it('should export Key type', () => {
      const key: Key = {
        name: 'test',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(key).toBeDefined();
    });
  });

  describe('all ctrl combinations', () => {
    it('should handle Ctrl+E correctly', () => {
      const key: Key = {
        name: 'e',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x05');
    });

    it('should handle Ctrl+N correctly', () => {
      const key: Key = {
        name: 'n',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x0e');
    });

    it('should handle Ctrl+P correctly', () => {
      const key: Key = {
        name: 'p',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      expect(keyToAnsi(key)).toBe('\x10');
    });
  });

  describe('return type', () => {
    it('should return string for mapped keys', () => {
      const key: Key = {
        name: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'a',
      };

      const result = keyToAnsi(key);
      expect(typeof result).toBe('string');
    });

    it('should return null for unmapped keys', () => {
      const key: Key = {
        name: 'unknown',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '',
      };

      const result = keyToAnsi(key);
      expect(result).toBeNull();
    });
  });
});
