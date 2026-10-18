/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { FakeContentGenerator } from '../core/fakeContentGenerator.js';
import { Config } from '../config/config.js';
import {
  RetryableQuotaError,
  TerminalQuotaError,
} from '../utils/googleQuotaErrors.js';
import {
  BASE_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  resetModelsForTesting,
} from '../config/models.js';
import fs from 'node:fs';
import { AuthType } from '../core/contentGenerator.js';
import type { FallbackIntent } from '../fallback/types.js';
import { LlmRole } from '../telemetry/types.js';
import type { GenerateContentResponse } from '@google/genai';
import { normalizeModelId } from '../utils/modelUtils.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';

vi.mock('node:fs');

describe('Auto Routing Fallback Integration', () => {
  let config: Config;
  let fakeGenerator: FakeContentGenerator;
  let client: BaseLlmClient;

  beforeEach(() => {
    resetModelsForTesting();
    vi.useFakeTimers();
    vi.spyOn(Config.prototype, 'getHasAccessToPreviewModel').mockReturnValue(
      true,
    );

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
    resetModelsForTesting();
  });

  it.each([
    [DEFAULT_GEMINI_MODEL, BASE_GEMINI_FLASH_MODEL],
    [BASE_GEMINI_FLASH_MODEL, DEFAULT_GEMINI_MODEL],
  ])(
    'retries stable Auto %s quota on %s immediately despite preview access',
    async (requestedModel, expectedModel) => {
      config = new Config({
        sessionId: 'stable-auto-quota',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: DEFAULT_GEMINI_MODEL_AUTO,
      });
      vi.spyOn(config, 'getGemini31LaunchedSync').mockReturnValue(true);
      const fallbackHandler = vi.fn();
      config.setFallbackModelHandler(fallbackHandler);
      client = new BaseLlmClient(
        fakeGenerator,
        config,
        AuthType.LOGIN_WITH_GOOGLE,
      );
      const generate = vi
        .spyOn(fakeGenerator, 'generateContent')
        .mockRejectedValueOnce(
          new TerminalQuotaError(
            'Daily quota exhausted',
            { code: 429, message: 'Daily quota exhausted', details: [] },
            3600,
            'QUOTA_EXHAUSTED',
          ),
        )
        .mockResolvedValue({
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Recovered' }] } },
          ],
        } as GenerateContentResponse);

      const response = await client.generateContent({
        modelConfigKey: { model: requestedModel, isChatModel: true },
        contents: [{ role: 'user', parts: [{ text: 'Continue' }] }],
        abortSignal: new AbortController().signal,
        promptId: 'stable-auto-quota',
        role: LlmRole.MAIN,
      });

      expect(response.candidates?.[0]?.content?.parts).toEqual([
        { text: 'Recovered' },
      ]);
      expect(generate.mock.calls.map(([request]) => request.model)).toEqual([
        requestedModel,
        expectedModel,
      ]);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL_AUTO);
      expect(config.getActiveModel()).toBe(expectedModel);
      expect(
        config.getModelAvailabilityService().snapshot(requestedModel),
      ).toEqual({
        available: false,
        reason: 'quota',
      });
      expect(fallbackHandler).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('keeps per-minute ErrorInfo metadata in the existing fallback flow', async () => {
    config = new Config({
      sessionId: 'per-minute-metadata',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL_AUTO,
    });
    vi.spyOn(config, 'isInteractive').mockReturnValue(true);
    const fallbackHandler = vi.fn(async (): Promise<FallbackIntent> => 'stop');
    config.setFallbackModelHandler(fallbackHandler);
    client = new BaseLlmClient(
      fakeGenerator,
      config,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    const generate = vi
      .spyOn(fakeGenerator, 'generateContent')
      .mockRejectedValue({
        error: {
          code: 429,
          message: 'Too many requests',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'RESOURCE_EXHAUSTED',
              domain: 'generativelanguage.googleapis.com',
              metadata: { quota_limit: 'RequestsPerMinute_PerProject_PerUser' },
            },
            {
              '@type': 'type.googleapis.com/google.rpc.RetryInfo',
              retryDelay: '600s',
            },
          ],
        },
      });

    await expect(
      client.generateContent({
        modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
        contents: [{ role: 'user', parts: [{ text: 'Continue' }] }],
        abortSignal: new AbortController().signal,
        promptId: 'per-minute-metadata',
        role: LlmRole.MAIN,
      }),
    ).rejects.toThrow('Too many requests');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(fallbackHandler).toHaveBeenCalledWith(
      PREVIEW_GEMINI_MODEL,
      PREVIEW_GEMINI_FLASH_MODEL,
      expect.any(TerminalQuotaError),
    );
    expect(config.getActiveModel()).toBe(PREVIEW_GEMINI_MODEL);
    expect(
      config.getModelAvailabilityService().snapshot(PREVIEW_GEMINI_MODEL),
    ).toEqual({
      available: true,
    });
    expect(vi.getTimerCount()).toBe(0);
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
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (modelId === PREVIEW_GEMINI_FLASH_MODEL) {
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
        if (normalizeModelId(failed) === PREVIEW_GEMINI_FLASH_MODEL) {
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
    expect(config.getModel()).toBe(PREVIEW_GEMINI_MODEL_AUTO);
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
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === normalizeModelId(PREVIEW_GEMINI_MODEL)) {
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
      'gemini-3-pro-preview',
      'gemini-3-pro-preview',
      expect.any(RetryableQuotaError),
    );
    expect(configNonAuto.getModel()).toBe(PREVIEW_GEMINI_MODEL);
    expect(configNonAuto.getActiveModel()).toBe(PREVIEW_GEMINI_MODEL);
  });

  it('should fallback to gemini-3.8-flash when hasLatestFlashGAAccess is enabled', async () => {
    config = new Config({
      sessionId: 'test-session-latest-flash',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL_AUTO,
    });

    vi.spyOn(config, 'isInteractive').mockReturnValue(true);
    config.setExperiments({
      flags: {
        [ExperimentFlags.LATEST_FLASH_GA_LAUNCHED]: {
          boolValue: true,
        },
      },
      experimentIds: [],
    });

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

    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (modelId === 'gemini-3.8-flash') {
          attemptsFlash++;
          return {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Latest flash success' }],
                },
              },
            ],
          } as unknown as GenerateContentResponse;
        }
        throw new Error(`Unexpected model: ${params.model}`);
      },
    );

    config.setFallbackModelHandler(
      async (_failed, _fallback, _error): Promise<FallbackIntent | null> =>
        'retry_always',
    );

    const promise = client.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
      contents: [{ role: 'user', parts: [{ text: 'test query' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt',
      role: LlmRole.UTILITY_TOOL,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'Latest flash success',
    );
    expect(attemptsPro).toBe(3);
    expect(attemptsFlash).toBe(1);
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
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (modelId === PREVIEW_GEMINI_FLASH_MODEL) {
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
        if (normalizeModelId(failed) === PREVIEW_GEMINI_FLASH_MODEL) {
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
    expect(configDynamic.getModel()).toBe(PREVIEW_GEMINI_MODEL_AUTO);
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
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (modelId === PREVIEW_GEMINI_FLASH_MODEL) {
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
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === PREVIEW_GEMINI_MODEL) {
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

  it('should rotate session ID on fallback and retry successfully with the Flash model', async () => {
    const originalSessionId = 'test-session-rotate-id';
    config = new Config({
      sessionId: originalSessionId,
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: PREVIEW_GEMINI_MODEL_AUTO,
    });

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
      message:
        'Automatically switching from gemini-2.5-pro to gemini-2.5-flash for faster responses for the remainder of this session. Possible reasons for this are...',
      details: [],
    };

    vi.spyOn(fakeGenerator, 'generateContent').mockImplementation(
      async (params) => {
        const modelId = normalizeModelId(params.model ?? '');
        if (modelId === PREVIEW_GEMINI_MODEL) {
          attemptsPro++;
          throw new RetryableQuotaError(
            'Quota exceeded for Pro',
            mockGoogleApiError,
            0,
          );
        } else if (modelId === PREVIEW_GEMINI_FLASH_MODEL) {
          attemptsFlash++;
          return {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Flash success after rotation' }],
                },
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

    const promise = client.generateContent({
      modelConfigKey: { model: PREVIEW_GEMINI_MODEL, isChatModel: true },
      contents: [{ role: 'user', parts: [{ text: 'test query' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test-prompt',
      role: LlmRole.UTILITY_TOOL,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    // Verify it resolved to Flash success instead of failing with Please submit a new query
    expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'Flash success after rotation',
    );
    expect(attemptsPro).toBe(3);
    expect(attemptsFlash).toBe(1);

    // Verify session ID has been rotated
    expect(config.getSessionId()).not.toBe(originalSessionId);
    expect(config.getSessionId()).toBeDefined();
  });
});
