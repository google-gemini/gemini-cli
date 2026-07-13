/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { retryWithBackoff } from './retry.js';
import { AuthType } from '../core/contentGenerator.js';
import { TerminalQuotaError } from './googleQuotaErrors.js';
import type { GoogleApiError } from './googleErrors.js';

vi.mock('node:fs');

describe('Shared Project Throttling Integration', () => {
  let mockGoogleApiError: GoogleApiError;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    mockGoogleApiError = {
      code: 429,
      message:
        'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_requests',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric:
                'generativelanguage.googleapis.com/generate_content_requests',
              quotaId:
                'GenerateRequestsPerMinutePerProjectPerModel-SharedProject',
              quotaDimensions: {
                location: 'global',
                model: 'gemini-2.5-pro',
              },
              quotaValue: '0',
            },
          ],
        },
      ],
    };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails completely when both Pro and Flash fallback models hit shared project quota limits', async () => {
    let currentModel = 'gemini-2.5-pro';
    const modelsAttempted: string[] = [];

    // Simulate API calls that fail on both models
    const mockApiCall = vi.fn().mockImplementation(async () => {
      modelsAttempted.push(currentModel);
      throw new TerminalQuotaError(
        `Quota exhausted for model ${currentModel} on shared project`,
        mockGoogleApiError,
      );
    });

    // Fallback handler changes the active model to Flash on persistent 429
    const mockPersistent429Callback = vi.fn(
      async (_authType?: string, _error?: unknown) => {
        if (currentModel === 'gemini-2.5-pro') {
          currentModel = 'gemini-2.5-flash';
          return 'gemini-2.5-flash';
        }
        return null; // No further fallback models
      },
    );

    const promise = retryWithBackoff(mockApiCall, {
      maxAttempts: 1,
      initialDelayMs: 1,
      maxDelayMs: 5,
      onPersistent429: mockPersistent429Callback,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    await expect(promise).rejects.toThrow(
      'Quota exhausted for model gemini-2.5-flash on shared project',
    );

    // Check that both models were tried and both failed due to the shared project limits
    expect(modelsAttempted).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(mockPersistent429Callback).toHaveBeenCalledTimes(2);
  });

  it('appends helpful troubleshooting hint when no user project is configured and auth is LOGIN_WITH_GOOGLE', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT_ID', '');

    const mockApiCall = vi
      .fn()
      .mockRejectedValue(
        new TerminalQuotaError('Daily limit reached', mockGoogleApiError),
      );

    const promise = retryWithBackoff(mockApiCall, {
      maxAttempts: 1,
      initialDelayMs: 1,
      maxDelayMs: 5,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    let caughtError: Error | undefined;
    try {
      await promise;
    } catch (e) {
      caughtError = e instanceof Error ? e : new Error(String(e));
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain(
      '💡 Tip: The shared Google Cloud project is experiencing high traffic',
    );
    expect(caughtError?.message).toContain(
      'gcloud config set project [PROJECT_ID]',
    );
  });

  it('does not append troubleshooting hint if a dedicated user project is set in environment', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'my-dedicated-project-123');

    const mockApiCall = vi
      .fn()
      .mockRejectedValue(
        new TerminalQuotaError('Daily limit reached', mockGoogleApiError),
      );

    const promise = retryWithBackoff(mockApiCall, {
      maxAttempts: 1,
      initialDelayMs: 1,
      maxDelayMs: 5,
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    const caughtError = await promise.catch((e) => e);
    const errorMsg =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    expect(errorMsg).not.toContain('💡 Tip:');
  });

  it('does not append troubleshooting hint for non-Google/ADC auth types', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');

    const mockApiCall = vi
      .fn()
      .mockRejectedValue(
        new TerminalQuotaError('Daily limit reached', mockGoogleApiError),
      );

    const promise = retryWithBackoff(mockApiCall, {
      maxAttempts: 1,
      initialDelayMs: 1,
      maxDelayMs: 5,
      authType: AuthType.USE_GEMINI, // API Key auth type
    });

    const caughtError = await promise.catch((e) => e);
    const errorMsg =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    expect(errorMsg).not.toContain('💡 Tip:');
  });
});
