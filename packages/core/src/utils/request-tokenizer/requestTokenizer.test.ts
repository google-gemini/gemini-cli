/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DefaultRequestTokenizer } from './requestTokenizer.js';

describe('DefaultRequestTokenizer', () => {
  const tokenizer = new DefaultRequestTokenizer();

  describe('calculateTokens', () => {
    it('should calculate tokens for text-only content', async () => {
      const result = await tokenizer.calculateTokens({
        model: 'gemini-pro',
        contents: [{ role: 'user', parts: [{ text: 'Hello, world!' }] }],
      });

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.breakdown.textTokens).toBeGreaterThan(0);
      expect(result.breakdown.imageTokens).toBe(0);
    });

    it('should calculate tokens for image content', async () => {
      const result = await tokenizer.calculateTokens({
        model: 'gemini-pro',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'iVBORw0KGgo=', // Minimal PNG-like data
                },
              },
            ],
          },
        ],
      });

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.breakdown.imageTokens).toBeGreaterThan(0);
      // Image tokens should be reasonable, not millions
      expect(result.breakdown.imageTokens).toBeLessThan(20000);
    });

    it('should calculate tokens for mixed content', async () => {
      const result = await tokenizer.calculateTokens({
        model: 'gemini-pro',
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Describe this image:' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'data',
                },
              },
            ],
          },
        ],
      });

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.breakdown.textTokens).toBeGreaterThan(0);
      expect(result.breakdown.imageTokens).toBeGreaterThan(0);
    });

    it('should return zero for empty content', async () => {
      const result = await tokenizer.calculateTokens({
        model: 'gemini-pro',
        contents: [],
      });

      expect(result.totalTokens).toBe(0);
    });

    it('should handle function calls as other content', async () => {
      const result = await tokenizer.calculateTokens({
        model: 'gemini-pro',
        contents: [
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'get_weather',
                  args: { location: 'Tokyo' },
                },
              },
            ],
          },
        ],
      });

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.breakdown.otherTokens).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('should dispose without error', async () => {
      const localTokenizer = new DefaultRequestTokenizer();
      await expect(localTokenizer.dispose()).resolves.not.toThrow();
    });
  });
});
