/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { Config } from '../config/config.js';

/**
 * GeminiConfigMock: A high-fidelity test double for the Config interface.
 */
export function createGeminiConfigMock(
  overrides: Partial<Config> = {},
): Config {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  /* eslint-disable @typescript-eslint/no-unsafe-return */
  /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  const baseConfig: Partial<Config> = {
    getTelemetryEnabled: () => false,
    isInteractive: () => false,
    getDisableLoopDetection: () => false,
    getMaxSessionTurns: () => 100,
    getModel: () => 'gemini-2.0-flash',
    getModelRouterService: () =>
      ({
        route: vi.fn().mockResolvedValue({ model: 'gemini-2.0-flash' }),
      }) as any,
    getEnableHooks: () => false,
    getContinueOnFailedApiCall: () => false,
    getQuotaErrorOccurred: () => false,
    getSkipNextSpeakerCheck: () => true,
    getUsageStatisticsEnabled: () => false,
    getDebugMode: () => false,
    getBaseLlmClient: () =>
      ({
        contentGenerator: {} as any,
        config: {} as any,
        generateJson: vi.fn(),
        generateEmbedding: vi.fn(),
        countTokens: vi.fn(),
        generateContent: vi.fn(),
        streamGenerateContent: vi.fn(),
      }) as any,
    getModelAvailabilityService: () =>
      ({
        snapshot: () => ({ available: true }),
        selectFirstAvailable: (models: string[]) => models[0],
      }) as any,
    modelConfigService: {
      getResolvedConfig: () => ({
        model: 'gemini-2.0-flash',
        generateContentConfig: {},
      }),
    } as any,
    getContentGenerator: () => ({}) as any,
    getSessionId: () => 'test-session-id',
    getToolRegistry: () =>
      ({
        getAllTools: () => [],
        getFunctionDeclarations: () => [],
      }) as any,
    getContentGeneratorConfig: () => ({}) as any,
    getHookSystem: () => undefined,
    resetTurn: vi.fn(),
    getMessageBus: () => ({}) as any,
    getRetryFetchErrors: () => false,
    getActiveModel: () => 'gemini-2.0-flash',
    getIdeMode: () => false,
    getToolOutputMaskingEnabled: () => false,
    getGeminiClient: vi.fn(),
    setActiveModel: vi.fn(),
    getGemini31LaunchedSync: () => false,
    getUserMemory: () => '',
    getValidationHandler: () => undefined,
  };

  return new Proxy(baseConfig as Config, {
    get: (target, prop) => {
      if (prop in overrides) {
        return (overrides as Record<string, any>)[prop as string];
      }
      if (prop in target) {
        return (target as Record<string, any>)[prop as string];
      }
      return vi.fn();
    },
  });
}
