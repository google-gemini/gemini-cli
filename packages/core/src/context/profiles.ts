/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextManagementConfig } from './types.js';

export const GENERALIST_PROFILE: ContextManagementConfig = {
  enabled: true,
  budget: {
    maxPressureStrategy: 'truncate',
    maxTokens: 150_000,
    retainedTokens: 65_000,
    protectedEpisodes: 1,
    protectSystemEpisode: true,
  },
  strategies: {
    // Brutal fallback truncation threshold
    historySquashing: { maxTokensPerNode: 4000 },
    // Mask massive JSON payloads
    toolMasking: { stringLengthThresholdTokens: 8000 },
    // Intelligently summarize large text blocks before they hit the truncation guillotine
    semanticCompression: {
      nodeThresholdTokens: 3000,
      compressionModel: 'chat-compression-2.5-flash-lite',
    },
  },
};

export const POWER_USER_PROFILE: ContextManagementConfig = {
  enabled: true,
  budget: {
    maxPressureStrategy: 'truncate',
    maxTokens: 150_000, // The absolute ceiling
    retainedTokens: 65_000, // The "bloom filter" backbuffer floor
    protectedEpisodes: 1,
    protectSystemEpisode: true,
  },
  strategies: {
    historySquashing: { maxTokensPerNode: 4000 },
    toolMasking: { stringLengthThresholdTokens: 8000 },
    semanticCompression: {
      nodeThresholdTokens: 3000,
      compressionModel: 'chat-compression-2.5-flash-lite',
    },
  },
};


export const STRESS_TEST_PROFILE: ContextManagementConfig = {
  enabled: true,
  budget: {
    maxPressureStrategy: 'truncate',
    maxTokens: 12_000,
    retainedTokens: 6_000,
    protectedEpisodes: 1,
    protectSystemEpisode: true,
  },
  strategies: {
    historySquashing: { maxTokensPerNode: 2000 },
    toolMasking: { stringLengthThresholdTokens: 2000 },
    semanticCompression: {
      nodeThresholdTokens: 1000,
      compressionModel: 'gemini-2.5-flash',
    },
  },
};
