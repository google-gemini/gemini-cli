/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  usePromptCompletion,
  PROMPT_COMPLETION_DEBOUNCE_MS,
} from './usePromptCompletion.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import { renderHookWithProviders } from '../../test-utils/render.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';

interface MockBuffer {
  text: string;
  cursor: [number, number];
  lines: string[];
  setText: (text: string) => void;
}

// Mock GoogleApiError for quota error constructors
const mockGoogleApiError = {
  code: 429,
  message: 'Quota exceeded',
  details: [],
};

describe('usePromptCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockBuffer = (
    text: string = '',
    cursor: [number, number] = [0, 0],
  ): MockBuffer => ({
    text,
    cursor,
    lines: [text],
    setText: vi.fn(),
  });

  it('should not trigger if disabled', async () => {
    const mockConfig = {
      getEnablePromptCompletion: vi.fn().mockReturnValue(false),
      getGeminiClient: vi.fn(),
      refreshUserQuota: vi.fn(),
      getCachedQuota: vi.fn(),
    } as unknown as Config;
    const buffer = createMockBuffer('Hello world', [0, 11]);

    renderHookWithProviders(() =>
      usePromptCompletion({
        buffer: buffer as unknown as TextBuffer,
        config: mockConfig,
        enabled: true,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    expect(mockConfig.getGeminiClient).not.toHaveBeenCalled();
  });

  it('should trigger after debounce when enabled and text is long enough', async () => {
    const mockGeminiClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: 'Hello world expanded' }] } },
        ],
      }),
    };
    const mockConfig = {
      getEnablePromptCompletion: vi.fn().mockReturnValue(true),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      refreshUserQuota: vi.fn().mockResolvedValue({}),
      getCachedQuota: vi.fn().mockReturnValue({
        buckets: [{ modelId: 'gemini-2.5-flash-lite', remainingFraction: 1.0 }],
      }),
    } as unknown as Config;
    const buffer = createMockBuffer('Hello world', [0, 11]);

    const { result } = renderHookWithProviders(() =>
      usePromptCompletion({
        buffer: buffer as unknown as TextBuffer,
        config: mockConfig,
        enabled: true,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
      { model: 'prompt-completion' },
      expect.any(Array),
      expect.any(AbortSignal),
    );
    expect(result.current.text).toBe('Hello world expanded');
  });

  it('should disable completions if quota is below 20%', async () => {
    const mockGeminiClient = {
      generateContent: vi.fn(),
    };
    const mockConfig = {
      getEnablePromptCompletion: vi.fn().mockReturnValue(true),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      refreshUserQuota: vi.fn().mockResolvedValue({
        buckets: [
          { modelId: 'gemini-2.5-flash-lite', remainingFraction: 0.15 },
        ],
      }),
      getCachedQuota: vi.fn().mockReturnValue({
        buckets: [
          { modelId: 'gemini-2.5-flash-lite', remainingFraction: 0.15 },
        ],
      }),
    } as unknown as Config;
    const buffer = createMockBuffer('Hello world', [0, 11]);

    renderHookWithProviders(() =>
      usePromptCompletion({
        buffer: buffer as unknown as TextBuffer,
        config: mockConfig,
        enabled: true,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
  });

  it('should disable completions on TerminalQuotaError (429)', async () => {
    const mockGeminiClient = {
      generateContent: vi
        .fn()
        .mockRejectedValue(
          new TerminalQuotaError('Quota exceeded', mockGoogleApiError),
        ),
    };
    const mockConfig = {
      getEnablePromptCompletion: vi.fn().mockReturnValue(true),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      refreshUserQuota: vi.fn().mockResolvedValue({}),
      getCachedQuota: vi.fn().mockReturnValue({
        buckets: [{ modelId: 'gemini-2.5-flash-lite', remainingFraction: 1.0 }],
      }),
    } as unknown as Config;
    const buffer = createMockBuffer('Hello world', [0, 11]);

    const { rerender } = renderHookWithProviders(
      (props: { buffer: TextBuffer; config: Config; enabled: boolean }) =>
        usePromptCompletion(props),
      {
        initialProps: {
          buffer: buffer as unknown as TextBuffer,
          config: mockConfig,
          enabled: true,
        },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);

    // Update buffer to trigger another potential completion
    const newBuffer = createMockBuffer('Hello world more', [0, 16]);
    rerender({
      buffer: newBuffer as unknown as TextBuffer,
      config: mockConfig,
      enabled: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    // Should still be 1 because it was disabled
    expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);
  });

  it('should cool down completions on RetryableQuotaError', async () => {
    const mockGeminiClient = {
      generateContent: vi
        .fn()
        .mockRejectedValue(
          new RetryableQuotaError('Rate limited', mockGoogleApiError, 1000),
        ),
    };
    const mockConfig = {
      getEnablePromptCompletion: vi.fn().mockReturnValue(true),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      refreshUserQuota: vi.fn().mockResolvedValue({}),
      getCachedQuota: vi.fn().mockReturnValue({
        buckets: [{ modelId: 'gemini-2.5-flash-lite', remainingFraction: 1.0 }],
      }),
    } as unknown as Config;
    const buffer = createMockBuffer('Hello world', [0, 11]);

    const { rerender } = renderHookWithProviders(
      (props: { buffer: TextBuffer; config: Config; enabled: boolean }) =>
        usePromptCompletion(props),
      {
        initialProps: {
          buffer: buffer as unknown as TextBuffer,
          config: mockConfig,
          enabled: true,
        },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);

    // Update buffer immediately
    const newBuffer = createMockBuffer('Hello world more', [0, 16]);
    rerender({
      buffer: newBuffer as unknown as TextBuffer,
      config: mockConfig,
      enabled: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    // Should still be 1 because it is in cool-down
    expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1);

    // Advance time past cool-down (60s)
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    // Update buffer again to trigger completion
    const finalBuffer = createMockBuffer('Hello world final', [0, 17]);
    rerender({
      buffer: finalBuffer as unknown as TextBuffer,
      config: mockConfig,
      enabled: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(PROMPT_COMPLETION_DEBOUNCE_MS);
    });

    // Should be 2 now
    expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(2);
  });
});
