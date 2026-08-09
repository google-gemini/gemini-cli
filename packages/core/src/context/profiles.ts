/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextManagementConfig } from './types.js';

export const generalistProfile: ContextManagementConfig = {
  enabled: true,
  historyWindow: { maxTokens: 150_000, retainedTokens: 80_000 },
  messageLimits: {
    normalMaxTokens: 3_000,
    retainedMaxTokens: 30_000,
    normalizationHeadRatio: 0.15,
  },
  tools: {
    distillation: {
      maxOutputTokens: 10_000,
      summarizationThresholdTokens: 20_000,
    },
    outputMasking: {
      protectionThresholdTokens: 50_000,
      minPrunableThresholdTokens: 30_000,
      protectLatestTurn: true,
    },
  },
};
