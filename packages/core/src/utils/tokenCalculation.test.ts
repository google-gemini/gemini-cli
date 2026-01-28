/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { calculateRequestTokenCount } from './tokenCalculation.js';
import type { ContentGenerator } from '../core/contentGenerator.js';

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

    // Estimation logic: JSON.stringify(part).length / 4
    // JSON: {"functionCall":{"name":"foo","args":{"bar":"baz"}}}
    // Length: ~53 chars. 53 / 4 = 13.25 -> 13.
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
    // Old logic would be 2/4 = 0.5 -> 0.
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

    // Should fallback to estimation:
    // 'Hello': 5 chars * 0.25 = 1.25
    // inlineData: 3000
    // Total: 3001.25 -> 3001
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

  describe('Gemini 3.0 Preview Logic', () => {
    const gemini3Model = 'gemini-3-pro-preview';

    it('should SKIP countTokens API and use local estimation for Gemini 3 models with media', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      const request = [
        { inlineData: { mimeType: 'image/png', data: 'data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        gemini3Model,
      );

      // Should find 3000 (fixed estimate for image)
      expect(count).toBe(3000);
      // Crucially, it should NOT have called the API
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should SKIP countTokens API and use local estimate for PDFs on Gemini 3', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      const request = [
        { inlineData: { mimeType: 'application/pdf', data: 'data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        gemini3Model,
      );

      // Should find 25800 (fixed estimate for PDF)
      expect(count).toBe(25800);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should STILL use countTokens API for non-Gemini-3 models (regression check)', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 123,
      });
      const oldModel = 'gemini-2.5-pro';
      const request = [
        { inlineData: { mimeType: 'image/png', data: 'data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        oldModel,
      );

      expect(count).toBe(123);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });
  });

  describe('FunctionResponse with Media (Gemini 3 Compatibility)', () => {
    // Mock a large PDF in a function response (~4MB base64 string)
    // 4MB string -> 1M tokens by string length heuristic
    const largeBase64 = 'a'.repeat(4 * 1024 * 1024);
    const functionResponsePart = {
      functionResponse: {
          name: 'readFile',
          response: {
            name: 'readFile',
            content: { output: 'Binary content provided' },
          },
      },
    };
    // Simulate the hidden 'parts' property used by Gemini 3 tools
    (functionResponsePart.functionResponse as any).parts = [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: largeBase64,
        },
      },
    ];

    it('should correctly estimate tokens for functionResponse with heavy media avoiding valid overestimation', async () => {
      // This regression test verifies correct estimation for Gemini 3 tools:
      // The current code doesn't see "inlineData" at the top level, so it falls back to
      // JSON.stringify().length / 4.
      // 4 million chars / 4 = 1 million tokens.
      // Expected (Fixed): Should be ~25800 (PDF estimate).

      // Current buggy behavior: Count is roughly 1 million
      // Expected (Fixed): Should be ~25800 (PDF estimate).

      const count = await calculateRequestTokenCount(
        [functionResponsePart],
        mockContentGenerator,
        'gemini-3-flash-preview',
      );

      // Verify fix: Should use PDF estimate (25800) + small JSON overhead
      expect(count).toBeGreaterThanOrEqual(25800);
      expect(count).toBeLessThan(26000);
    });
  });
});
