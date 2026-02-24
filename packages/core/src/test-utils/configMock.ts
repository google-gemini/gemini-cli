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
export function createGeminiConfigMock(overrides: Partial<Config> = {}): Config {
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
    getModelRouterService: () => ({
      route: vi.fn().mockResolvedValue({ model: 'gemini-2.0-flash' }),
    } as any),
    getEnableHooks: () => false,
    getContinueOnFailedApiCall: () => false,
    getQuotaErrorOccurred: () => false,
    getSkipNextSpeakerCheck: () => true,
    getUsageStatisticsEnabled: () => false,
    getDebugMode: () => false,
    getBaseLlmClient: () => ({}),
    getModelAvailabilityService: () => ({
      snapshot: () => ({ available: true }),
      selectFirstAvailable: (models: string[]) => models[0],
    } as any),
    modelConfigService: {
      getResolvedConfig: () => ({ model: 'gemini-2.0-flash', generateContentConfig: {} }),
    } as any,
    getContentGenerator: () => ({} as any),
    getSessionId: () => 'test-session-id',
    getToolRegistry: () => ({
      getAllTools: () => [],
      getFunctionDeclarations: () => [],
    } as any),
    getContentGeneratorConfig: () => ({}),
    getHookSystem: () => null,
    resetTurn: vi.fn(),
    getMessageBus: () => null,
    getRetryFetchErrors: () => false,
    getActiveModel: () => 'gemini-2.0-flash',
    getIdeMode: () => false,
    getToolOutputMaskingEnabled: () => false,
    getGeminiClient: vi.fn(),
    getHistory: () => [],
    setActiveModel: vi.fn(),
    getGemini31LaunchedSync: () => false,
    getUserMemory: () => '',
    getValidationHandler: () => null,
  };

  return new Proxy(baseConfig as Config, {
    get: (target, prop) => {
      if (prop in overrides) {
        return (overrides as Record<string, unknown>)[prop as string];
      }
      if (prop in target) {
        return (target as Record<string, unknown>)[prop as string];
      }
      return vi.fn();
    },
  });
}
