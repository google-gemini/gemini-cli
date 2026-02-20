/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveAuthValue,
  needsResolution,
  maskSensitiveValue,
} from './value-resolver.js';

describe('value-resolver', () => {
  describe('resolveAuthValue', () => {
    describe('environment variables', () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('should resolve environment variable with $ prefix', async () => {
        vi.stubEnv('TEST_API_KEY', 'secret-key-123');
        const result = await resolveAuthValue('$TEST_API_KEY');
        expect(result).toBe('secret-key-123');
      });

      it('should throw error for unset environment variable', async () => {
        await expect(resolveAuthValue('$UNSET_VAR_12345')).rejects.toThrow(
          "Environment variable 'UNSET_VAR_12345' is not set or is empty",
        );
      });

      it('should throw error for empty environment variable', async () => {
        vi.stubEnv('EMPTY_VAR', '');
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
        await expect(resolveAuthValue('!echo -n ""')).rejects.toThrow(
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

    describe('escaped literals', () => {
      it('should return $ literal when value starts with $$', async () => {
        const result = await resolveAuthValue('$$LITERAL');
        expect(result).toBe('$LITERAL');
      });

      it('should return ! literal when value starts with !!', async () => {
        const result = await resolveAuthValue('!!not-a-command');
        expect(result).toBe('!not-a-command');
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
    it('should mask value longer than 12 characters', () => {
      expect(maskSensitiveValue('1234567890abcd')).toBe('12****cd');
    });

    it('should return **** for short values', () => {
      expect(maskSensitiveValue('short')).toBe('****');
    });

    it('should return **** for exactly 12 characters', () => {
      expect(maskSensitiveValue('123456789012')).toBe('****');
    });

    it('should return **** for empty string', () => {
      expect(maskSensitiveValue('')).toBe('****');
    });
  });
});
