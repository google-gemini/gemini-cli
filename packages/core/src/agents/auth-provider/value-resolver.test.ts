/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveAuthValue,
  needsResolution,
  maskSensitiveValue,
} from './value-resolver.js';

describe('value-resolver', () => {
  describe('resolveAuthValue', () => {
    describe('environment variables', () => {
      const originalEnv = process.env;

      beforeEach(() => {
        process.env = { ...originalEnv };
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      it('should resolve environment variable with $ prefix', async () => {
        process.env['TEST_API_KEY'] = 'secret-key-123';
        const result = await resolveAuthValue('$TEST_API_KEY');
        expect(result).toBe('secret-key-123');
      });

      it('should throw error for unset environment variable', async () => {
        delete process.env['UNSET_VAR'];
        await expect(resolveAuthValue('$UNSET_VAR')).rejects.toThrow(
          "Environment variable 'UNSET_VAR' is not set or is empty",
        );
      });

      it('should throw error for empty environment variable', async () => {
        process.env['EMPTY_VAR'] = '';
        await expect(resolveAuthValue('$EMPTY_VAR')).rejects.toThrow(
          "Environment variable 'EMPTY_VAR' is not set or is empty",
        );
      });
    });

    describe('shell commands', () => {
      it('should execute shell command with ! prefix', async () => {
        const result = await resolveAuthValue('!echo hello');
        expect(result).toBe('hello');
      });

      it('should trim whitespace from command output', async () => {
        const result = await resolveAuthValue('!echo "  hello  "');
        expect(result).toBe('hello');
      });

      it('should throw error for empty command', async () => {
        await expect(resolveAuthValue('!')).rejects.toThrow(
          'Empty command in auth value',
        );
      });

      it('should throw error for command that returns empty output', async () => {
        // Use printf which is more portable than echo -n
        await expect(resolveAuthValue('!printf ""')).rejects.toThrow(
          'returned empty output',
        );
      });

      it('should throw error for failed command', async () => {
        await expect(
          resolveAuthValue('!nonexistent-command-12345'),
        ).rejects.toThrow(/Command.*failed/);
      });
    });

    describe('literal values', () => {
      it('should return literal value as-is', async () => {
        const result = await resolveAuthValue('literal-api-key');
        expect(result).toBe('literal-api-key');
      });

      it('should return empty string as-is', async () => {
        const result = await resolveAuthValue('');
        expect(result).toBe('');
      });

      it('should not treat values starting with other characters as special', async () => {
        const result = await resolveAuthValue('api-key-123');
        expect(result).toBe('api-key-123');
      });
    });
  });

  describe('needsResolution', () => {
    it('should return true for environment variable reference', () => {
      expect(needsResolution('$ENV_VAR')).toBe(true);
    });

    it('should return true for command reference', () => {
      expect(needsResolution('!command')).toBe(true);
    });

    it('should return false for literal value', () => {
      expect(needsResolution('literal')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(needsResolution('')).toBe(false);
    });
  });

  describe('maskSensitiveValue', () => {
    it('should mask value longer than 8 characters', () => {
      expect(maskSensitiveValue('1234567890')).toBe('12****90');
    });

    it('should return **** for short values', () => {
      expect(maskSensitiveValue('short')).toBe('****');
    });

    it('should return **** for exactly 8 characters', () => {
      expect(maskSensitiveValue('12345678')).toBe('****');
    });

    it('should return **** for empty string', () => {
      expect(maskSensitiveValue('')).toBe('****');
    });
  });
});
