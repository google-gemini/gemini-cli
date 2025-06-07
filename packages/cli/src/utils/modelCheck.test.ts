/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEffectiveModel } from './modelCheck.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../config/config.js';

// Mock global fetch
global.fetch = vi.fn();

// Mock AbortController
const mockAbort = vi.fn();
global.AbortController = vi.fn(() => ({
  signal: { aborted: false }, // Start with not aborted
  abort: mockAbort,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
})) as any;

describe('getEffectiveModel', () => {
  const apiKey = 'test-api-key';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset signal for each test if AbortController mock is more complex
    global.AbortController = vi.fn(() => ({
      signal: { aborted: false },
      abort: mockAbort,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('when currentConfiguredModel is not DEFAULT_GEMINI_MODEL', () => {
    it('should return the currentConfiguredModel without fetching', async () => {
      const customModel = 'custom-model-name';
      const result = await getEffectiveModel(apiKey, customModel);
      expect(result).toEqual(customModel);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('when currentConfiguredModel is DEFAULT_GEMINI_MODEL', () => {
    it('should switch to DEFAULT_GEMINI_FLASH_MODEL if fetch returns 429', async () => {
      (fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      });
      const result = await getEffectiveModel(apiKey, DEFAULT_GEMINI_MODEL);
      expect(result).toEqual(DEFAULT_GEMINI_FLASH_MODEL);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`,
        expect.any(Object),
      );
    });

    it('should return DEFAULT_GEMINI_MODEL if fetch returns 200', async () => {
      (fetch as vi.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      const result = await getEffectiveModel(apiKey, DEFAULT_GEMINI_MODEL);
      expect(result).toEqual(DEFAULT_GEMINI_MODEL);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return DEFAULT_GEMINI_MODEL if fetch returns a non-429 error status (e.g., 500)', async () => {
      (fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      const result = await getEffectiveModel(apiKey, DEFAULT_GEMINI_MODEL);
      expect(result).toEqual(DEFAULT_GEMINI_MODEL);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return DEFAULT_GEMINI_MODEL if fetch throws a network error', async () => {
      (fetch as vi.Mock).mockRejectedValueOnce(new Error('Network error'));
      const result = await getEffectiveModel(apiKey, DEFAULT_GEMINI_MODEL);
      expect(result).toEqual(DEFAULT_GEMINI_MODEL);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return DEFAULT_GEMINI_MODEL if fetch times out', async () => {
      // Simulate AbortController's signal changing and fetch throwing AbortError
      const abortControllerInstance = {
        signal: { aborted: false }, // mutable signal
        abort: vi.fn(() => {
          abortControllerInstance.signal.aborted = true; // Use abortControllerInstance
        }),
      };
      (global.AbortController as vi.Mock).mockImplementationOnce(
        () => abortControllerInstance,
      );

      (fetch as vi.Mock).mockImplementationOnce(
        async ({ signal }: { signal: AbortSignal }) => {
          // Simulate the timeout advancing and abort being called
          vi.advanceTimersByTime(2000);
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          // Should not reach here in a timeout scenario
          return { ok: true, status: 200 };
        },
      );

      const resultPromise = getEffectiveModel(apiKey, DEFAULT_GEMINI_MODEL);
      // Ensure timers are advanced to trigger the timeout within getEffectiveModel
      await vi.advanceTimersToNextTimerAsync(); // Or advanceTimersByTime(2000) if more precise control is needed

      const result = await resultPromise;

      expect(mockAbort).toHaveBeenCalledTimes(0); // setTimeout calls controller.abort(), not our direct mockAbort
      expect(abortControllerInstance.abort).toHaveBeenCalledTimes(1);
      expect(result).toEqual(DEFAULT_GEMINI_MODEL);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should correctly pass API key and model in the fetch request', async () => {
      (fetch as vi.Mock).mockResolvedValueOnce({ ok: true, status: 200 });
      const specificApiKey = 'specific-key-for-this-test';
      await getEffectiveModel(specificApiKey, DEFAULT_GEMINI_MODEL);

      expect(fetch).toHaveBeenCalledWith(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${specificApiKey}`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }],
            generationConfig: {
              maxOutputTokens: 1,
              temperature: 0,
              topK: 1,
              thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
            },
          }),
        }),
      );
    });
  });
});
