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
  resetRequestCounter,
} from './testUtils.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { retryWithBackoff } from './retry.js';
import { AuthType } from '../core/contentGenerator.js';
// Import the new types (Assuming this test file is in packages/core/src/utils/)
import type { FallbackModelHandler } from '../fallback/types.js';
import type { GoogleApiError } from './googleErrors.js';
import { TerminalQuotaError } from './googleQuotaErrors.js';

vi.mock('node:fs');

// Update the description to reflect that this tests the retry utility's integration
describe('Retry Utility Fallback Integration', () => {
  let config: Config;
  let mockGoogleApiError: GoogleApiError;

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
    mockGoogleApiError = {
      code: 429,
      message: 'mock error',
      details: [],
    };

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
      new Error('test'),
    );

    // Verify it returns the correct intent
    expect(result).toBe('retry');
  });

  // This test validates the retry utility's logic for triggering the callback.
  it('should trigger onPersistent429 on TerminalQuotaError for OAuth users', async () => {
    let fallbackCalled = false;

    const mockApiCall = vi
      .fn()
      .mockRejectedValueOnce(
        new TerminalQuotaError('Daily limit', mockGoogleApiError),
      )
      .mockRejectedValueOnce(
        new TerminalQuotaError('Daily limit', mockGoogleApiError),
      )
      .mockResolvedValueOnce('success after fallback');

    const mockPersistent429Callback = vi.fn(async (_authType?: string) => {
      fallbackCalled = true;
      return true;
    });

    const result = await retryWithBackoff(mockApiCall, {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 10,
      onPersistent429: mockPersistent429Callback,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    expect(fallbackCalled).toBe(true);
    expect(mockPersistent429Callback).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
      expect.any(TerminalQuotaError),
    );
    expect(result).toBe('success after fallback');
    expect(mockApiCall).toHaveBeenCalledTimes(3);
  });

  it('should not trigger onPersistent429 for API key users', async () => {
    const fallbackCallback = vi.fn();

    const mockApiCall = vi
      .fn()
      .mockRejectedValueOnce(
        new TerminalQuotaError('Daily limit', mockGoogleApiError),
      );

    const promise = retryWithBackoff(mockApiCall, {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 10,
      onPersistent429: fallbackCallback,
      authType: AuthType.USE_GEMINI, // API key auth type
    });

    await expect(promise).rejects.toThrow('Daily limit');
    expect(fallbackCallback).not.toHaveBeenCalled();
    expect(mockApiCall).toHaveBeenCalledTimes(1);
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
