/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { tokenLimit, DEFAULT_TOKEN_LIMIT } from './tokenLimits.js';

describe('tokenLimits', () => {
  describe('DEFAULT_TOKEN_LIMIT', () => {
    it('should be defined as 1,048,576', () => {
      expect(DEFAULT_TOKEN_LIMIT).toBe(1_048_576);
    });
  });

  describe('tokenLimit', () => {
    describe('gemini-1.5 models', () => {
      it('should return 2,097,152 for gemini-1.5-pro', () => {
        expect(tokenLimit('gemini-1.5-pro')).toBe(2_097_152);
      });

      it('should return 1,048,576 for gemini-1.5-flash', () => {
        expect(tokenLimit('gemini-1.5-flash')).toBe(1_048_576);
      });
    });

    describe('gemini-2.5 models', () => {
      it('should return 1,048,576 for gemini-2.5-pro-preview-05-06', () => {
        expect(tokenLimit('gemini-2.5-pro-preview-05-06')).toBe(1_048_576);
      });

      it('should return 1,048,576 for gemini-2.5-pro-preview-06-05', () => {
        expect(tokenLimit('gemini-2.5-pro-preview-06-05')).toBe(1_048_576);
      });

      it('should return 1,048,576 for gemini-2.5-pro', () => {
        expect(tokenLimit('gemini-2.5-pro')).toBe(1_048_576);
      });

      it('should return 1,048,576 for gemini-2.5-flash-preview-05-20', () => {
        expect(tokenLimit('gemini-2.5-flash-preview-05-20')).toBe(1_048_576);
      });

      it('should return 1,048,576 for gemini-2.5-flash', () => {
        expect(tokenLimit('gemini-2.5-flash')).toBe(1_048_576);
      });

      it('should return 1,048,576 for gemini-2.5-flash-lite', () => {
        expect(tokenLimit('gemini-2.5-flash-lite')).toBe(1_048_576);
      });
    });

    describe('gemini-2.0 models', () => {
      it('should return 1,048,576 for gemini-2.0-flash', () => {
        expect(tokenLimit('gemini-2.0-flash')).toBe(1_048_576);
      });

      it('should return 32,000 for gemini-2.0-flash-preview-image-generation', () => {
        expect(tokenLimit('gemini-2.0-flash-preview-image-generation')).toBe(
          32_000,
        );
      });
    });

    describe('unknown models', () => {
      it('should return DEFAULT_TOKEN_LIMIT for unknown model', () => {
        expect(tokenLimit('unknown-model')).toBe(DEFAULT_TOKEN_LIMIT);
      });

      it('should return DEFAULT_TOKEN_LIMIT for empty string', () => {
        expect(tokenLimit('')).toBe(DEFAULT_TOKEN_LIMIT);
      });

      it('should return DEFAULT_TOKEN_LIMIT for similar but non-matching model name', () => {
        expect(tokenLimit('gemini-1.5-pro-custom')).toBe(DEFAULT_TOKEN_LIMIT);
      });

      it('should return DEFAULT_TOKEN_LIMIT for case mismatch', () => {
        expect(tokenLimit('GEMINI-1.5-PRO')).toBe(DEFAULT_TOKEN_LIMIT);
      });
    });

    describe('edge cases', () => {
      it('should handle model names with whitespace', () => {
        expect(tokenLimit(' gemini-1.5-pro ')).toBe(DEFAULT_TOKEN_LIMIT);
      });

      it('should be case-sensitive', () => {
        expect(tokenLimit('Gemini-1.5-Pro')).toBe(DEFAULT_TOKEN_LIMIT);
      });
    });

    describe('comprehensive model coverage', () => {
      it('should have different limits for different model families', () => {
        const proLimit = tokenLimit('gemini-1.5-pro');
        const flashLimit = tokenLimit('gemini-2.0-flash');
        const imageGenLimit = tokenLimit(
          'gemini-2.0-flash-preview-image-generation',
        );

        expect(proLimit).not.toBe(flashLimit);
        expect(flashLimit).not.toBe(imageGenLimit);
        expect(proLimit).toBe(2_097_152);
        expect(flashLimit).toBe(1_048_576);
        expect(imageGenLimit).toBe(32_000);
      });
    });
  });
});
