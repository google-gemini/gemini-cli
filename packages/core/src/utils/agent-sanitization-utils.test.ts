/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  clearRestorableSecretStore,
  restoreRedactedSecrets,
  sanitizeErrorMessage,
  sanitizeToolArgs,
  sanitizeThoughtContent,
  sanitizeModelContent,
  sanitizeModelContentWithPresidio,
} from './agent-sanitization-utils.js';

describe('agent-sanitization-utils', () => {
  beforeEach(() => {
    clearRestorableSecretStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact standard inline PEM content', () => {
      const input =
        'Here is my key: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA12345\n-----END RSA PRIVATE KEY----- do not share.';
      const expected = 'Here is my key: [REDACTED_PEM] do not share.';
      expect(sanitizeErrorMessage(input)).toBe(expected);
    });

    it('should redact non-standard inline PEM content (with punctuation)', () => {
      const input =
        '-----BEGIN X.509 CERTIFICATE-----\nMIIEowIBAAKCAQEA12345\n-----END X.509 CERTIFICATE-----';
      const expected = '[REDACTED_PEM]';
      expect(sanitizeErrorMessage(input)).toBe(expected);
    });

    it('should not hang on ReDoS attack string for PEM redaction', () => {
      const start = Date.now();
      // A string that starts with -----BEGIN but has no ending, with many spaces
      // In the vulnerable regex, this would cause catastrophic backtracking.
      const maliciousInput = '-----BEGIN ' + ' '.repeat(50000) + 'A';
      const result = sanitizeErrorMessage(maliciousInput);
      const duration = Date.now() - start;

      // Should process very quickly (e.g. < 50ms)
      expect(duration).toBeLessThan(50);

      // Since it doesn't match the full PEM block pattern, it should return the input unaltered
      expect(result).toBe(maliciousInput);
    });

    it('should redact key-value pairs with sensitive keys', () => {
      const input = 'Error: connection failed. --api-key="secret123"';
      const result = sanitizeErrorMessage(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('secret123');
    });

    it('should redact space-separated sensitive keywords', () => {
      // The keyword regex requires tokens to be 8+ chars
      const input = 'Using password mySuperSecretPassword123';
      const result = sanitizeErrorMessage(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('mySuperSecretPassword123');
    });
  });

  describe('sanitizeToolArgs', () => {
    it('should redact sensitive fields in an object', () => {
      const input = {
        username: 'admin',
        password: 'superSecretPassword',
        nested: {
          api_key: 'abc123xyz',
          normal_field: 'hello',
        },
      };

      const result = sanitizeToolArgs(input);

      expect(result).toEqual({
        username: 'admin',
        password: expect.stringMatching(/^\[REDACTED:[^\]]+\]$/),
        nested: {
          api_key: expect.stringMatching(/^\[REDACTED:[^\]]+\]$/),
          normal_field: 'hello',
        },
      });
      expect(restoreRedactedSecrets(result)).toEqual(input);
    });

    it('should handle arrays and strings correctly', () => {
      const input = ['normal string', '--api-key="secret123"'];
      const result = sanitizeToolArgs(input) as string[];

      expect(result[0]).toBe('normal string');
      expect(result[1]).toContain('[REDACTED:');
      expect(result[1]).not.toContain('secret123');
      expect(restoreRedactedSecrets(result)).toEqual(input);
    });
  });

  describe('sanitizeThoughtContent', () => {
    it('should redact sensitive patterns from thought content', () => {
      const input = 'I will now authenticate using token 1234567890abcdef.';
      const result = sanitizeThoughtContent(input);

      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('1234567890abcdef');
    });
  });

  describe('sanitizeModelContent', () => {
    it('redacts a standalone OAuth client secret', () => {
      const secret = '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';

      const result = sanitizeModelContent(`Please inspect ${secret}`);

      expect(result).toMatch(/^Please inspect \[REDACTED:[^\]]+\]$/);
      expect(restoreRedactedSecrets(result)).toBe(`Please inspect ${secret}`);
    });
  });

  describe('sanitizeModelContentWithPresidio', () => {
    it('redacts and restores names detected by Presidio', async () => {
      const input = 'Ask Ada Lovelace to review this.';
      const start = input.indexOf('Ada Lovelace');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify([
              {
                entity_type: 'PERSON',
                start,
                end: start + 'Ada Lovelace'.length,
                score: 0.93,
              },
            ]),
            { status: 200 },
          ),
        ),
      );

      const result = await sanitizeModelContentWithPresidio(input);

      expect(result).not.toContain('Ada Lovelace');
      expect(result).toMatch(/^Ask \[REDACTED:[^\]]+\] to review this\.$/);
      expect(restoreRedactedSecrets(result)).toBe(input);
    });

    it('fails closed when the analyzer cannot be reached', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

      await expect(
        sanitizeModelContentWithPresidio('Contact Ada Lovelace'),
      ).rejects.toThrow('Presidio Analyzer is required');
    });

    it('converts Presidio code-point offsets for text containing emoji', async () => {
      const input = 'Wave 👋 to Ada Lovelace.';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify([
              {
                entity_type: 'PERSON',
                start: 10,
                end: 22,
                score: 0.93,
              },
            ]),
            { status: 200 },
          ),
        ),
      );

      const result = await sanitizeModelContentWithPresidio(input);

      expect(result).toMatch(/^Wave 👋 to \[REDACTED:[^\]]+\]\.$/);
      expect(restoreRedactedSecrets(result)).toBe(input);
    });

    it('can be disabled explicitly for isolated callers and tests', async () => {
      expect(
        await sanitizeModelContentWithPresidio('Ada Lovelace', {
          enabled: false,
        }),
      ).toBe('Ada Lovelace');
    });
  });
});
