/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateRequestTokenCount,
  estimateTokenCountSync,
} from './tokenCalculation.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Part } from '@google/genai';

describe('tokenCalculation', () => {
  describe('calculateRequestTokenCount', () => {
    const mockContentGenerator = {
      countTokens: vi.fn(),
    } as unknown as ContentGenerator;

    const model = 'gemini-pro';

    it('should use countTokens API for media requests (images/files)', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 100,
      });
      const request = [{ inlineData: { mimeType: 'image/png', data: 'data' } }];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(100);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should estimate tokens locally for tool calls', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      const request = [{ functionCall: { name: 'foo', args: { bar: 'baz' } } }];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBeGreaterThan(0);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should estimate tokens locally for simple ASCII text', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      // 12 chars. 12 * 0.25 = 3 tokens.
      const request = 'Hello world!';

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should estimate tokens locally for CJK text with higher weight', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      // 2 chars. 2 * 1.3 = 2.6 -> floor(2.6) = 2.
      const request = '你好';

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBeGreaterThanOrEqual(2);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should handle mixed content', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      // 'Hi': 2 * 0.25 = 0.5
      // '你好': 2 * 1.3 = 2.6
      // Total: 3.1 -> 3
      const request = 'Hi你好';

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should handle empty text', async () => {
      const request = '';
      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );
      expect(count).toBe(0);
    });

    it('should fallback to local estimation when countTokens API fails', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      const request = [
        { text: 'Hello' },
        { inlineData: { mimeType: 'image/png', data: 'data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3001);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should use fixed estimate for images in fallback', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      const request = [
        { inlineData: { mimeType: 'image/png', data: 'large_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3000);
    });

    it('should use countTokens API for PDF requests', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 5160,
      });
      const request = [
        { inlineData: { mimeType: 'application/pdf', data: 'pdf_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(5160);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should use fixed estimate for PDFs in fallback', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      const request = [
        { inlineData: { mimeType: 'application/pdf', data: 'large_pdf_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      // PDF estimate: 25800 tokens (~100 pages at 258 tokens/page)
      expect(count).toBe(25800);
    });
  });

  describe('estimateTokenCountSync', () => {
    it('should use fast heuristic for massive strings', () => {
      const massiveText = 'a'.repeat(200_000);
      // 200,000 / 4 = 50,000 tokens
      const parts: Part[] = [{ text: massiveText }];
      expect(estimateTokenCountSync(parts)).toBe(50000);
    });

    it('should estimate functionResponse without full stringification', () => {
      const toolResult = 'result'.repeat(1000); // 6000 chars
      const parts: Part[] = [
        {
          functionResponse: {
            name: 'my_tool',
            id: '123',
            response: { output: toolResult },
          },
        },
      ];

      const tokens = estimateTokenCountSync(parts);
      // payload ~6013 chars / 4 = 1503.25
      // name 7 / 4 = 1.75
      // total ~1505
      expect(tokens).toBeGreaterThan(1500);
      expect(tokens).toBeLessThan(1600);
    });

    it('should handle Gemini 3 multimodal nested parts in functionResponse', () => {
      const parts: Part[] = [
        {
          functionResponse: {
            name: 'multimodal_tool',
            id: '456',
            response: { status: 'success' },
            // Gemini 3 nested parts
            parts: [
              { inlineData: { mimeType: 'image/png', data: 'base64...' } },
              { text: 'Look at this image' },
            ] as Part[],
          },
        },
      ];

      const tokens = estimateTokenCountSync(parts);
      // image 3000 + text 4.5 + response 5 = ~3009.5
      expect(tokens).toBeGreaterThan(3000);
      expect(tokens).toBeLessThan(3100);
    });

    it('should respect the maximum recursion depth limit', () => {
      // Create a structure nested to depth 5 (exceeding limit of 3)
      const parts: Part[] = [
        {
          functionResponse: {
            name: 'd0',
            response: { val: 'a' }, // ~12 chars -> 3 tokens
            parts: [
              {
                functionResponse: {
                  name: 'd1',
                  response: { val: 'a' }, // ~12 chars -> 3 tokens
                  parts: [
                    {
                      functionResponse: {
                        name: 'd2',
                        response: { val: 'a' }, // ~12 chars -> 3 tokens
                        parts: [
                          {
                            functionResponse: {
                              name: 'd3',
                              response: { val: 'a' }, // ~12 chars -> 3 tokens
                              parts: [
                                {
                                  functionResponse: {
                                    name: 'd4',
                                    response: { val: 'a' },
                                  },
                                },
                              ] as Part[],
                            },
                          },
                        ] as Part[],
                      },
                    },
                  ] as Part[],
                },
              },
            ] as Part[],
          },
        },
      ];

      const tokens = estimateTokenCountSync(parts);
      // It should count d0, d1, d2, d3 (depth 0, 1, 2, 3) but NOT d4 (depth 4)
      // d0..d3: 4 * ~4 tokens = ~16
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(30);
    });

    it('should handle empty or nullish inputs gracefully', () => {
      expect(estimateTokenCountSync([])).toBe(0);
      expect(estimateTokenCountSync([{ text: '' }])).toBe(0);
      expect(estimateTokenCountSync([{} as Part])).toBe(0);
    });
  });
});
