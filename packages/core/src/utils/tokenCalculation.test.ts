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
    // inlineData: JSON.stringify length / 4
    expect(count).toBeGreaterThan(0);
    expect(mockContentGenerator.countTokens).toHaveBeenCalled();
  });
});
