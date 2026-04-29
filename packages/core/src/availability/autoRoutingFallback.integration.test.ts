/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { FakeContentGenerator } from '../core/fakeContentGenerator.js';
import { Config } from '../config/config.js';
import { RetryableQuotaError } from '../utils/googleQuotaErrors.js';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';
import fs from 'node:fs';
import { AuthType } from '../core/contentGenerator.js';
import type { FallbackIntent } from '../fallback/types.js';
import { LlmRole } from '../telemetry/types.js';
import type { GenerateContentResponse } from '@google/genai';

vi.mock('node:fs');

describe('Auto Routing Fallback Integration', () => {
  let config: Config;
  let fakeGenerator: FakeContentGenerator;
  let client: BaseLlmClient;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock fs to avoid real file system access
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    // Provide a valid dummy sandbox policy for any readFileSync calls for TOML files
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.endsWith('.toml')) {
        return `
          [modes.plan]
          network = false
          readonly = true
          approvedTools = []

          [modes.default]
          network = false
          readonly = false
          approvedTools = []

          [modes.accepting_edits]
          network = false
          readonly = false
          approvedTools = []
        `;
      }
      return ''; // Fallback for other files
    });

    fakeGenerator = new FakeContentGenerator([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should fallback to Flash after 3 tries and try 10 times for Flash in auto mode', async () => {
    // Instantiate real Config in auto mode
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL_AUTO, // Trigger auto mode
    });

    // Force interactive mode to enable fallback handler in BaseLlmClient
    vi.spyOn(config, 'isInteractive').mockReturnValue(true);

    client = new BaseLlmClient(
      fakeGenerator,
      config,
      AuthType.LOGIN_WITH_GOOGLE,
    );

    let attemptsPro = 0;
    let attemptsFlash = 0;

    const mockGoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [],
    };

    // Spy on generateContent to simulate failures
    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        if (params.model === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (params.model === PREVIEW_GEMINI_FLASH_MODEL) {
          attemptsFlash++;
          throw new RetryableQuotaError(
            'Quota exceeded for Flash',
            mockGoogleApiError,
            0,
          );
        }
        throw new Error(`Unexpected model: ${params.model}`);
      },
    );

    // Set a fallback handler that approves the switch (simulating user or auto approval)
    config.setFallbackModelHandler(
      async (failed, _fallback, _error): Promise<FallbackIntent | null> => {
        if (failed === PREVIEW_GEMINI_FLASH_MODEL) {
          return 'stop'; // Stop retrying after Flash fails
        }
        return 'retry_always'; // Trigger fallback to Flash
      },
    );

    // Call generateContent
    const promise = client.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt',
      role: LlmRole.UTILITY_TOOL,
    });

    await Promise.all([
      expect(promise).rejects.toThrow('Quota exceeded for Flash'),
      vi.runAllTimersAsync(),
    ]);

    // Verify attempts
    expect(attemptsPro).toBe(3);
    expect(attemptsFlash).toBe(10);
  });

  it('should try 10 times and prompt user in non-auto mode', async () => {
    // Instantiate real Config in non-auto mode
    const configNonAuto = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL, // Non-auto mode
    });

    // Force interactive mode to enable fallback handler in BaseLlmClient
    vi.spyOn(configNonAuto, 'isInteractive').mockReturnValue(true);

    const clientNonAuto = new BaseLlmClient(
      fakeGenerator,
      configNonAuto,
      AuthType.LOGIN_WITH_GOOGLE,
    );

    let attemptsPro = 0;

    const mockGoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [],
    };

    // Spy on generateContent to simulate failures
    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        if (params.model === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        }
        throw new Error(`Unexpected model: ${params.model}`);
      },
    );

    // Set a fallback handler that returns 'stop' (simulating user stopping or failing to handle)
    const handler = vi.fn(
      async (_failed, _fallback, _error): Promise<FallbackIntent | null> =>
        'stop',
    );
    configNonAuto.setFallbackModelHandler(handler);

    const promise = clientNonAuto.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt',
      role: LlmRole.UTILITY_TOOL,
      maxAttempts: 10,
    });

    await Promise.all([
      expect(promise).rejects.toThrow('Quota exceeded for Pro'),
      vi.runAllTimersAsync(),
    ]);

    // Verify attempts (should default to 10)
    expect(attemptsPro).toBe(10);

    // Verify handler was called once after 10 attempts to prompt user
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      PREVIEW_GEMINI_MODEL,
      PREVIEW_GEMINI_FLASH_MODEL,
      expect.any(RetryableQuotaError),
    );
  });

  it('should fallback to Flash after 3 tries in experimental dynamic mode', async () => {
    // Instantiate real Config in auto mode
    const configDynamic = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL_AUTO, // Trigger auto mode
    });

    // Force interactive mode to enable fallback handler in BaseLlmClient
    vi.spyOn(configDynamic, 'isInteractive').mockReturnValue(true);

    // Enable experimental dynamic model configuration
    vi.spyOn(
      configDynamic,
      'getExperimentalDynamicModelConfiguration',
    ).mockReturnValue(true);

    const clientDynamic = new BaseLlmClient(
      fakeGenerator,
      configDynamic,
      AuthType.LOGIN_WITH_GOOGLE,
    );

    let attemptsPro = 0;
    let attemptsFlash = 0;

    const mockGoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [],
    };

    // Spy on generateContent to simulate failures
    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        if (params.model === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (params.model === PREVIEW_GEMINI_FLASH_MODEL) {
          attemptsFlash++;
          throw new RetryableQuotaError(
            'Quota exceeded for Flash',
            mockGoogleApiError,
            0,
          );
        }
        throw new Error(`Unexpected model: ${params.model}`);
      },
    );

    // Set a fallback handler that approves the switch
    configDynamic.setFallbackModelHandler(
      async (failed, _fallback, _error): Promise<FallbackIntent | null> => {
        if (failed === PREVIEW_GEMINI_FLASH_MODEL) {
          return 'stop';
        }
        return 'retry_always';
      },
    );

    const promise = clientDynamic.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt',
      role: LlmRole.UTILITY_TOOL,
    });

    await Promise.all([
      expect(promise).rejects.toThrow('Quota exceeded for Flash'),
      vi.runAllTimersAsync(),
    ]);

    // Verify attempts
    expect(attemptsPro).toBe(3);
    expect(attemptsFlash).toBe(10);
  });

  it('should retry Pro on next turn after successful fallback to Flash', async () => {
    // Instantiate real Config in auto mode
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL_AUTO, // Trigger auto mode
    });

    // Force interactive mode to enable fallback handler in BaseLlmClient
    vi.spyOn(config, 'isInteractive').mockReturnValue(true);

    client = new BaseLlmClient(
      fakeGenerator,
      config,
      AuthType.LOGIN_WITH_GOOGLE,
    );

    let attemptsPro = 0;
    let attemptsFlash = 0;

    const mockGoogleApiError = {
      code: 429,
      message: 'Quota exceeded',
      details: [],
    };

    // Turn 1: Pro fails, Flash succeeds
    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        if (params.model === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (params.model === PREVIEW_GEMINI_FLASH_MODEL) {
          attemptsFlash++;
          return {
            candidates: [
              {
                content: { role: 'model', parts: [{ text: 'Flash success' }] },
              },
            ],
          } as unknown as GenerateContentResponse;
        }
        throw new Error(`Unexpected model: ${params.model}`);
      },
    );

    config.setFallbackModelHandler(
      async (_failed, _fallback, _error): Promise<FallbackIntent | null> =>
        'retry_always', // Approve switch to Flash
    );

    // Call generateContent for Turn 1
    const promise1 = client.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt-1',
      role: LlmRole.UTILITY_TOOL,
    });

    await vi.runAllTimersAsync();
    const result1 = await promise1;

    expect(result1.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'Flash success',
    );
    expect(attemptsPro).toBe(3);
    expect(attemptsFlash).toBe(1);

    // Simulate start of next turn
    config.getModelAvailabilityService().resetTurn();

    // Turn 2: Pro should be attempted again!
    // Let's make it succeed this time to verify it works!
    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        if (params.model === PREVIEW_GEMINI_MODEL) {
          return {
            candidates: [
              { content: { role: 'model', parts: [{ text: 'Pro success' }] } },
            ],
          } as unknown as GenerateContentResponse;
        }
        throw new Error(`Unexpected model: ${params.model}`);
      },
    );

    const promise2 = client.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true }, // Request Pro again
      contents: [{ role: 'user', parts: [{ text: 'hello again' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt-2',
      role: LlmRole.UTILITY_TOOL,
    });

    const result2 = await promise2;
    expect(result2.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'Pro success',
    );
  });
});
