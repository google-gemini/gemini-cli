/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { FallbackContentGenerator } from './fallbackContentGenerator.js';
import { MockExhaustedError } from './fakeContentGenerator.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { GenerateContentParameters } from '@google/genai';
import { LlmRole } from '../telemetry/types.js';

describe('FallbackContentGenerator', () => {
  const dummyRequest: GenerateContentParameters = {
    model: 'gemini',
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
  };

  it('delegates to the primary generator if successful', async () => {
    const mockPrimary = {
      generateContent: vi.fn().mockResolvedValue({ text: 'primary response' }),
    } as unknown as ContentGenerator;
    const mockFallback = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    const result = await generator.generateContent(
      dummyRequest,
      'prompt-id',
      LlmRole.MAIN,
    );

    expect(result).toEqual({ text: 'primary response' });
    expect(mockPrimary.generateContent).toHaveBeenCalledWith(
      dummyRequest,
      'prompt-id',
      LlmRole.MAIN,
    );
    expect(mockFallback.generateContent).not.toHaveBeenCalled();
  });

  it('bubbles up regular errors from the primary generator', async () => {
    const mockPrimary = {
      generateContent: vi.fn().mockRejectedValue(new Error('Network failure')),
    } as unknown as ContentGenerator;
    const mockFallback = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    await expect(
      generator.generateContent(dummyRequest, 'prompt-id', LlmRole.MAIN),
    ).rejects.toThrow('Network failure');
    expect(mockFallback.generateContent).not.toHaveBeenCalled();
  });

  it('falls back to the secondary generator if primary throws MockExhaustedError', async () => {
    const mockPrimary = {
      generateContent: vi
        .fn()
        .mockRejectedValue(new MockExhaustedError('generateContent')),
    } as unknown as ContentGenerator;
    const mockFallback = {
      generateContent: vi.fn().mockResolvedValue({ text: 'fallback response' }),
    } as unknown as ContentGenerator;
    const onFallback = vi.fn();

    const generator = new FallbackContentGenerator(
      mockPrimary,
      mockFallback,
      onFallback,
    );
    const result = await generator.generateContent(
      dummyRequest,
      'prompt-id',
      LlmRole.MAIN,
    );

    expect(result).toEqual({ text: 'fallback response' });
    expect(mockPrimary.generateContent).toHaveBeenCalled();
    expect(onFallback).toHaveBeenCalledWith('generateContent');
    expect(mockFallback.generateContent).toHaveBeenCalledWith(
      dummyRequest,
      'prompt-id',
      LlmRole.MAIN,
    );
  });

  it('bubbles up MockExhaustedError if the fallback generator also exhausts', async () => {
    const mockPrimary = {
      generateContent: vi
        .fn()
        .mockRejectedValue(new MockExhaustedError('generateContent')),
    } as unknown as ContentGenerator;
    const mockFallback = {
      generateContent: vi
        .fn()
        .mockRejectedValue(new MockExhaustedError('generateContent')),
    } as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    await expect(
      generator.generateContent(dummyRequest, 'prompt-id', LlmRole.MAIN),
    ).rejects.toThrow(MockExhaustedError);
  });

  it('handles stream delegation and fallback', async () => {
    const asyncStream = async function* () {
      yield { text: 'stream chunk' };
    };
    const mockPrimary = {
      generateContentStream: vi
        .fn()
        .mockRejectedValue(new MockExhaustedError('generateContentStream')),
    } as unknown as ContentGenerator;
    const mockFallback = {
      generateContentStream: vi.fn().mockResolvedValue(asyncStream()),
    } as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    const result = await generator.generateContentStream(
      dummyRequest,
      'prompt-id',
      LlmRole.MAIN,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: any[] = [];
    for await (const chunk of result) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ text: 'stream chunk' }]);
    expect(mockFallback.generateContentStream).toHaveBeenCalled();
  });

  it('handles optional methods like countTokens that are missing on primary', async () => {
    const mockPrimary = {} as unknown as ContentGenerator;
    const mockFallback = {
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 42 }),
    } as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    const result = await generator.countTokens({
      model: 'gemini',
      contents: [],
    });

    expect(result).toEqual({ totalTokens: 42 });
    expect(mockFallback.countTokens).toHaveBeenCalled();
  });

  it('handles optional methods like embedContent that are missing on primary', async () => {
    const mockPrimary = {} as unknown as ContentGenerator;
    const mockFallback = {
      embedContent: vi.fn().mockResolvedValue({ embedding: { values: [0.1] } }),
    } as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    const result = await generator.embedContent({
      model: 'gemini',
      contents: { parts: [{ text: '' }] },
    });

    expect(result).toEqual({ embedding: { values: [0.1] } });
    expect(mockFallback.embedContent).toHaveBeenCalled();
  });

  it('proxies tier properties from the primary', () => {
    const mockPrimary = {
      userTier: 'test-tier',
      userTierName: 'Test Tier',
      paidTier: true,
    } as unknown as ContentGenerator;
    const mockFallback = {} as unknown as ContentGenerator;

    const generator = new FallbackContentGenerator(mockPrimary, mockFallback);
    expect(generator.userTier).toBe('test-tier');
    expect(generator.userTierName).toBe('Test Tier');
    expect(generator.paidTier).toBe(true);
  });
});
