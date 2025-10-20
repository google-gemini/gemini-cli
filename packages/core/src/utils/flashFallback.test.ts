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
// Import the new types (Assuming this test file is in packages/core/src/utils/)
import type { FallbackModelHandler } from '../fallback/types.js';

vi.mock('node:fs');

// Update the description to reflect that this tests the retry utility's integration
describe('Retry Utility Fallback Integration', () => {
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

  // This test validates the Config's ability to store and execute the handler contract.
  it('should execute the injected FallbackHandler contract correctly', async () => {
    // Set up a minimal handler for testing, ensuring it matches the new type.
    const fallbackHandler: FallbackModelHandler = async () => 'retry';

    // Use the generalized setter
    config.setFallbackModelHandler(fallbackHandler);

    // Call the handler directly via the config property
    const result = await config.fallbackModelHandler!(
      'gemini-2.5-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );

    // Verify it returns the correct intent
    expect(result).toBe('retry');
  });

  // This test validates the retry utility's logic for triggering the callback.
  it('should trigger onPersistent429 after 2 consecutive 429 errors for OAuth users', async () => {
    let fallbackCalled = false;
    // Removed fallbackModel variable as it's no longer relevant here.

    // Mock function that simulates exactly 2 429 errors, then succeeds after fallback
    const mockApiCall = vi
      .fn()
      .mockRejectedValueOnce(createSimulated429Error())
      .mockRejectedValueOnce(createSimulated429Error())
      .mockResolvedValueOnce('success after fallback');

    // Mock the onPersistent429 callback (this is what client.ts/geminiChat.ts provides)
    const mockPersistent429Callback = vi.fn(async (_authType?: string) => {
      fallbackCalled = true;
      // Return true to signal retryWithBackoff to reset attempts and continue.
      return true;
    });

    // Test with OAuth personal auth type, with maxAttempts = 2 to ensure fallback triggers
    const result = await retryWithBackoff(mockApiCall, {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 10,
      shouldRetryOnError: (error: Error) => {
        const status = (error as Error & { status?: number }).status;
        return status === 429;
      },
      onPersistent429: mockPersistent429Callback,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    // Verify fallback mechanism was triggered
    expect(fallbackCalled).toBe(true);
    expect(mockPersistent429Callback).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
      expect.any(Error),
    );
    expect(result).toBe('success after fallback');
    // Should have: 2 failures, then fallback triggered, then 1 success after retry reset
    expect(mockApiCall).toHaveBeenCalledTimes(3);
  });

  it('should not trigger onPersistent429 for API key users', async () => {
    let fallbackCalled = false;

    // Mock function that simulates 429 errors
    const mockApiCall = vi.fn().mockRejectedValue(createSimulated429Error());

    // Mock the callback
    const mockPersistent429Callback = vi.fn(async () => {
      fallbackCalled = true;
      return true;
    });

    // Test with API key auth type - should not trigger fallback
    try {
      await retryWithBackoff(mockApiCall, {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        shouldRetryOnError: (error: Error) => {
          const status = (error as Error & { status?: number }).status;
          return status === 429;
        },
        onPersistent429: mockPersistent429Callback,
        authType: AuthType.USE_GEMINI, // API key auth type
      });
    } catch (error) {
      // Expected to throw after max attempts
      expect((error as Error).message).toContain('Rate limit exceeded');
    }

    // Verify fallback was NOT triggered for API key users
    expect(fallbackCalled).toBe(false);
    expect(mockPersistent429Callback).not.toHaveBeenCalled();
  });

  // This test validates the test utilities themselves.
  it('should properly disable simulation state after fallback (Test Utility)', () => {
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
