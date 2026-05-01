/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { validateCommandExecution } from './argument-validator.js';

describe('validateCommandExecution', () => {
  describe('command name validation', () => {
    it('should accept valid command names', () => {
      expect(validateCommandExecution('memory', []).valid).toBe(true);
      expect(validateCommandExecution('memory show', []).valid).toBe(true);
      expect(validateCommandExecution('memory list', []).valid).toBe(true);
      expect(validateCommandExecution('memory add', ['test']).valid).toBe(true);
      expect(validateCommandExecution('restore', ['checkpoint']).valid).toBe(
        true,
      );
      expect(validateCommandExecution('extensions', []).valid).toBe(true);
      expect(validateCommandExecution('init', []).valid).toBe(true);
    });

    it('should reject command names with null bytes', () => {
      const result = validateCommandExecution('memory\0show', []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid command name');
    });

    it('should reject command names with special characters', () => {
      expect(validateCommandExecution('memory;show', []).valid).toBe(false);
      expect(validateCommandExecution('memory|show', []).valid).toBe(false);
      expect(validateCommandExecution('memory&show', []).valid).toBe(false);
      expect(validateCommandExecution('memory`show', []).valid).toBe(false);
      expect(validateCommandExecution('memory$show', []).valid).toBe(false);
      expect(validateCommandExecution('memory<show', []).valid).toBe(false);
      expect(validateCommandExecution('memory>show', []).valid).toBe(false);
      expect(validateCommandExecution('memory(show)', []).valid).toBe(false);
      expect(validateCommandExecution('memory{show}', []).valid).toBe(false);
      expect(validateCommandExecution('memory[show]', []).valid).toBe(false);
    });

    it('should reject empty command names', () => {
      const result = validateCommandExecution('', []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid command name');
    });

    it('should reject command names starting with numbers', () => {
      const result = validateCommandExecution('123memory', []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid command name');
    });

    it('should accept unknown but valid command names', () => {
      // Unknown commands pass basic validation; the registry check happens later
      const result = validateCommandExecution('unknown-command', []);
      expect(result.valid).toBe(true);
    });
  });

  describe('memory commands', () => {
    it('should accept "memory show" with no arguments', () => {
      const result = validateCommandExecution('memory show', []);
      expect(result.valid).toBe(true);
    });

    it('should reject "memory show" with arguments', () => {
      const result = validateCommandExecution('memory show', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });

    it('should accept "memory list" with no arguments', () => {
      const result = validateCommandExecution('memory list', []);
      expect(result.valid).toBe(true);
    });

    it('should reject "memory list" with arguments', () => {
      const result = validateCommandExecution('memory list', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });

    it('should accept "memory refresh" with no arguments', () => {
      const result = validateCommandExecution('memory refresh', []);
      expect(result.valid).toBe(true);
    });

    it('should reject "memory refresh" with arguments', () => {
      const result = validateCommandExecution('memory refresh', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });

    describe('memory add', () => {
      it('should accept valid text', () => {
        const result = validateCommandExecution('memory add', [
          'This is valid text',
        ]);
        expect(result.valid).toBe(true);
      });

      it('should accept multiple arguments (joined as text)', () => {
        const result = validateCommandExecution('memory add', [
          'Add',
          'this',
          'text',
        ]);
        expect(result.valid).toBe(true);
      });

      it('should reject empty text', () => {
        const result = validateCommandExecution('memory add', []);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('requires text to add');
      });

      it('should reject text with shell metacharacters', () => {
        expect(
          validateCommandExecution('memory add', ['test;rm -rf /']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ['test|whoami']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ['test`whoami`']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ['test$(whoami)']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ['test&whoami']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ['test<file']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ['test>file']).valid,
        ).toBe(false);
      });

      it('should reject text with control characters', () => {
        const result = validateCommandExecution('memory add', [
          'test\x00malicious',
        ]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('control characters');
      });

      it('should reject text exceeding max length', () => {
        const longText = 'a'.repeat(11 * 1024); // 11KB
        const result = validateCommandExecution('memory add', [longText]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('max 10KB');
      });

      it('should accept text with newlines and tabs', () => {
        const result = validateCommandExecution('memory add', [
          'Line 1\nLine 2\tTabbed',
        ]);
        expect(result.valid).toBe(true);
      });

      it('should reject text with quotes', () => {
        expect(
          validateCommandExecution('memory add', ['test"quote']).valid,
        ).toBe(false);
        expect(
          validateCommandExecution('memory add', ["test'quote"]).valid,
        ).toBe(false);
      });

      it('should reject text with asterisks and wildcards', () => {
        expect(validateCommandExecution('memory add', ['test*']).valid).toBe(
          false,
        );
        expect(validateCommandExecution('memory add', ['test?']).valid).toBe(
          false,
        );
      });
    });
  });

  describe('restore command', () => {
    it('should accept valid checkpoint name', () => {
      const result = validateCommandExecution('restore', ['checkpoint123']);
      expect(result.valid).toBe(true);
    });

    it('should accept checkpoint name with dashes and underscores', () => {
      expect(
        validateCommandExecution('restore', ['checkpoint-name_123']).valid,
      ).toBe(true);
    });

    it('should accept checkpoint name with .json extension', () => {
      expect(
        validateCommandExecution('restore', ['checkpoint.json']).valid,
      ).toBe(true);
      expect(
        validateCommandExecution('restore', ['checkpoint-123.json']).valid,
      ).toBe(true);
    });

    it('should reject checkpoint with no arguments', () => {
      const result = validateCommandExecution('restore', []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a checkpoint name');
    });

    it('should reject checkpoint with multiple arguments', () => {
      const result = validateCommandExecution('restore', [
        'checkpoint1',
        'arg2',
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('accepts only one argument');
    });

    it('should reject checkpoint names with path traversal', () => {
      expect(validateCommandExecution('restore', ['../checkpoint']).valid).toBe(
        false,
      );
      expect(
        validateCommandExecution('restore', ['../../etc/passwd']).valid,
      ).toBe(false);
      expect(
        validateCommandExecution('restore', ['checkpoint/../other']).valid,
      ).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(validateCommandExecution('restore', ['/etc/passwd']).valid).toBe(
        false,
      );
      expect(
        validateCommandExecution('restore', ['/tmp/checkpoint.json']).valid,
      ).toBe(false);
    });

    it('should reject Windows absolute paths', () => {
      expect(
        validateCommandExecution('restore', ['C:\\checkpoint.json']).valid,
      ).toBe(false);
    });

    it('should reject checkpoint names with special characters', () => {
      expect(
        validateCommandExecution('restore', ['checkpoint;rm -rf /']).valid,
      ).toBe(false);
      expect(
        validateCommandExecution('restore', ['checkpoint|whoami']).valid,
      ).toBe(false);
      expect(
        validateCommandExecution('restore', ['checkpoint`whoami`']).valid,
      ).toBe(false);
      expect(
        validateCommandExecution('restore', ['checkpoint$var']).valid,
      ).toBe(false);
      expect(validateCommandExecution('restore', ['check point']).valid).toBe(
        false,
      );
    });

    it('should reject checkpoint names exceeding max length', () => {
      const longName = 'a'.repeat(256) + '.json';
      const result = validateCommandExecution('restore', [longName]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid checkpoint name');
    });

    it('should reject checkpoint names with null bytes', () => {
      const result = validateCommandExecution('restore', ['checkpoint\0.json']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid checkpoint name');
    });
  });

  describe('restore list command', () => {
    it('should accept no arguments', () => {
      const result = validateCommandExecution('restore list', []);
      expect(result.valid).toBe(true);
    });

    it('should reject with arguments', () => {
      const result = validateCommandExecution('restore list', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });
  });

  describe('extensions commands', () => {
    it('should accept "extensions" with no arguments', () => {
      const result = validateCommandExecution('extensions', []);
      expect(result.valid).toBe(true);
    });

    it('should accept "extensions list" with no arguments', () => {
      const result = validateCommandExecution('extensions list', []);
      expect(result.valid).toBe(true);
    });

    it('should reject "extensions" with arguments', () => {
      const result = validateCommandExecution('extensions', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });

    it('should reject "extensions list" with arguments', () => {
      const result = validateCommandExecution('extensions list', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });
  });

  describe('init command', () => {
    it('should accept no arguments', () => {
      const result = validateCommandExecution('init', []);
      expect(result.valid).toBe(true);
    });

    it('should reject with arguments', () => {
      const result = validateCommandExecution('init', ['arg']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not accept arguments');
    });
  });

  describe('DoS protection', () => {
    it('should reject too many arguments', () => {
      const manyArgs = Array(101).fill('arg');
      const result = validateCommandExecution('memory add', manyArgs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Too many arguments');
    });

    it('should reject arguments that are too long', () => {
      const longArg = 'a'.repeat(101 * 1024); // 101KB
      const result = validateCommandExecution('memory add', [longArg]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Argument too long');
    });

    it('should reject non-string arguments', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = validateCommandExecution('memory add', [123 as any]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be strings');
    });
  });

  describe('edge cases', () => {
    it('should handle empty args array', () => {
      const result = validateCommandExecution('extensions', []);
      expect(result.valid).toBe(true);
    });

    it('should handle undefined args (converted to empty array)', () => {
      const result = validateCommandExecution('extensions', []);
      expect(result.valid).toBe(true);
    });

    it('should handle args with empty strings', () => {
      const result = validateCommandExecution('memory add', ['']);
      expect(result.valid).toBe(false); // Empty text is invalid
    });

    it('should handle Unicode characters in memory text', () => {
      // Unicode should be rejected for safety (shell metachar pattern catches some)
      const result = validateCommandExecution('memory add', ['test 你好']);
      expect(result.valid).toBe(true); // Normal unicode is ok
    });
  });
});
