/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import fs from 'node:fs';
import {
  setSimulate429,
  disableSimulationAfterFallback,
  shouldSimulate429,
  createSimulated429Error,
  resetRequestCounter,
} from './testUtils.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { retryWithBackoff } from './retry.js';
import { AuthType } from '../core/contentGenerator.js';

vi.mock('node:fs');

describe('Flash Fallback Integration', () => {
  let config: Config;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: 'gemini-2.5-pro',
    });

    // Reset simulation state for each test
    setSimulate429(false);
    resetRequestCounter();
  });

  it('should automatically accept fallback', async () => {
    // Set up a minimal flash fallback handler for testing
    const flashFallbackHandler = async (): Promise<boolean> => true;

    config.setFlashFallbackHandler(flashFallbackHandler);

    // Call the handler directly to test
    const result = await config.flashFallbackHandler!(
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );

    // Verify it automatically accepts
    expect(result).toBe(true);
  });

  it('should trigger fallback after 2 consecutive 429 errors for OAuth users', async () => {
    let fallbackCalled = false;
    let fallbackModel = '';

    // Mock function that simulates exactly 2 429 errors, then succeeds after fallback
    const mockApiCall = vi
      .fn()
      .mockRejectedValueOnce(createSimulated429Error())
      .mockRejectedValueOnce(createSimulated429Error())
      .mockResolvedValueOnce('success after fallback');

    // Mock fallback handler
    const mockFallbackHandler = vi.fn(async (_authType?: string) => {
      fallbackCalled = true;
      fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;
      return fallbackModel;
    });

    // Test with OAuth personal auth type, with maxAttempts = 2 to ensure fallback triggers
    const result = await retryWithBackoff(mockApiCall, {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 10,
      shouldRetry: (error: Error) => {
        const status = (error as Error & { status?: number }).status;
        return status === 429;
      },
      onPersistent429: mockFallbackHandler,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    // Verify fallback was triggered
    expect(fallbackCalled).toBe(true);
    expect(fallbackModel).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    expect(mockFallbackHandler).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
      expect.any(Error),
    );
    expect(result).toBe('success after fallback');
    // Should have: 2 failures, then fallback triggered, then 1 success after retry reset
    expect(mockApiCall).toHaveBeenCalledTimes(3);
  });

  it('should not trigger fallback for API key users', async () => {
    let fallbackCalled = false;

    // Mock function that simulates 429 errors
    const mockApiCall = vi.fn().mockRejectedValue(createSimulated429Error());

    // Mock fallback handler
    const mockFallbackHandler = vi.fn(async () => {
      fallbackCalled = true;
      return DEFAULT_GEMINI_FLASH_MODEL;
    });

    // Test with API key auth type - should not trigger fallback
    try {
      await retryWithBackoff(mockApiCall, {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        shouldRetry: (error: Error) => {
          const status = (error as Error & { status?: number }).status;
          return status === 429;
        },
        onPersistent429: mockFallbackHandler,
        authType: AuthType.USE_GEMINI, // API key auth type
      });
    } catch (error) {
      // Expected to throw after max attempts
      expect((error as Error).message).toContain('Rate limit exceeded');
    }

    // Verify fallback was NOT triggered for API key users
    expect(fallbackCalled).toBe(false);
    expect(mockFallbackHandler).not.toHaveBeenCalled();
  });

  it('should properly disable simulation state after fallback', () => {
    // Enable simulation
    setSimulate429(true);

    // Verify simulation is enabled
    expect(shouldSimulate429()).toBe(true);

    // Disable simulation after fallback
    disableSimulationAfterFallback();

    // Verify simulation is now disabled
    expect(shouldSimulate429()).toBe(false);
  });
});
