/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AgentHistoryProviderConfig {
  maxTokens: number;
  retainedTokens: number;
  normalMessageTokens: number;
  maximumMessageTokens: number;
  normalizationHeadRatio: number;
}

export interface ToolOutputMaskingConfig {
  protectionThresholdTokens: number;
  minPrunableThresholdTokens: number;
  protectLatestTurn: boolean;
}

export interface ContextManagementConfig {
  enabled: boolean;
  historyWindow: {
    maxTokens: number;
    retainedTokens: number;
  };
  messageLimits: {
    normalMaxTokens: number;
    retainedMaxTokens: number;
    normalizationHeadRatio: number;
  };
  tools: {
    distillation: {
      maxOutputTokens: number;
      summarizationThresholdTokens: number;
    };
    outputMasking: ToolOutputMaskingConfig;
  };
}
