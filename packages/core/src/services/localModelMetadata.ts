/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LocalModelMetadata {
  id: string;
  displayName: string;
  backendId: string;

  contextLength: number;

  supportsVision: boolean;
  supportsAudio: boolean;
  supportsReasoning: boolean;
  supportsToolUse: boolean;

  thinkingConfig: LocalThinkingConfig;

  paramSize: string;
  quantization: string;

  isLoaded: boolean;
}

export interface LocalThinkingConfig {
  nativeThinking: boolean;
  implementation: string;
  maxThinkingTokens: number;
  visibleReasoningInOutput: boolean;
}

export interface ModelTuningSettings {
  maxContextTokens: number;
  compressionThreshold: number;
  tokenWarningThreshold: number;

  defaultTemperature: number;
  defaultTopK: number;
  defaultTopP: number;

  enableToolUse: boolean;
  enableVisionInput: boolean;
  maxImageResolution: number;

  enableThinking: boolean;
  thinkingBudget: number;
  thinkingMode: 'native-token' | 'prompt-based' | 'none';
  stripThinkingHistory: boolean;

  profile: 'small' | 'medium' | 'large' | 'xl';
  batchTools: boolean;
  prefetchContext: boolean;
}

const GEMMA4_DEFAULTS: Record<
  string,
  Omit<LocalModelMetadata, 'id' | 'backendId'>
> = {
  e2b: {
    displayName: 'Gemma 4 E2B',
    contextLength: 131072,
    supportsVision: true,
    supportsAudio: true,
    supportsReasoning: true,
    supportsToolUse: true,
    thinkingConfig: {
      nativeThinking: true,
      implementation: 'native-token',
      maxThinkingTokens: 16384,
      visibleReasoningInOutput: true,
    },
    paramSize: '5.1B',
    quantization: 'Q4_K_M',
    isLoaded: true,
  },
  e4b: {
    displayName: 'Gemma 4 E4B',
    contextLength: 131072,
    supportsVision: true,
    supportsAudio: true,
    supportsReasoning: true,
    supportsToolUse: true,
    thinkingConfig: {
      nativeThinking: true,
      implementation: 'native-token',
      maxThinkingTokens: 16384,
      visibleReasoningInOutput: true,
    },
    paramSize: '8.0B',
    quantization: 'Q4_K_M',
    isLoaded: true,
  },
  '26b': {
    displayName: 'Gemma 4 26B',
    contextLength: 262144,
    supportsVision: true,
    supportsAudio: false,
    supportsReasoning: true,
    supportsToolUse: true,
    thinkingConfig: {
      nativeThinking: true,
      implementation: 'native-token',
      maxThinkingTokens: 32768,
      visibleReasoningInOutput: true,
    },
    paramSize: '25.2B',
    quantization: 'Q4_K_M',
    isLoaded: true,
  },
  '31b': {
    displayName: 'Gemma 4 31B',
    contextLength: 262144,
    supportsVision: true,
    supportsAudio: false,
    supportsReasoning: true,
    supportsToolUse: true,
    thinkingConfig: {
      nativeThinking: true,
      implementation: 'native-token',
      maxThinkingTokens: 32768,
      visibleReasoningInOutput: true,
    },
    paramSize: '30.7B',
    quantization: 'Q4_K_M',
    isLoaded: true,
  },
};

export function resolveGemma4Defaults(
  modelId: string,
): Partial<LocalModelMetadata> {
  const lower = modelId.toLowerCase();
  for (const [variant, defaults] of Object.entries(GEMMA4_DEFAULTS)) {
    if (lower.includes(variant)) {
      return defaults;
    }
  }
  return {};
}

export function tuneModelFromMetadata(
  meta: LocalModelMetadata,
): ModelTuningSettings {
  const maxContextTokens = Math.min(meta.contextLength, 1_000_000);
  const compressionThreshold = Math.floor(maxContextTokens * 0.75);
  const tokenWarningThreshold = Math.floor(maxContextTokens * 0.9);

  const enableVisionInput = meta.supportsVision;

  let enableThinking: boolean;
  let thinkingBudget: number;
  let thinkingMode: 'native-token' | 'prompt-based' | 'none';
  let stripThinkingHistory: boolean;

  if (meta.thinkingConfig?.nativeThinking) {
    thinkingMode = 'native-token';
    enableThinking = true;
    thinkingBudget =
      meta.thinkingConfig.maxThinkingTokens ??
      Math.min(Math.floor(maxContextTokens * 0.15), 16384);
    stripThinkingHistory = true;
  } else {
    thinkingMode = 'none';
    enableThinking = false;
    thinkingBudget = 0;
    stripThinkingHistory = false;
  }

  const enableToolUse = meta.supportsToolUse;

  const paramSizeGiga = parseFloat(meta.paramSize.replace(/[^0-9.]/g, ''));
  let profile: 'small' | 'medium' | 'large' | 'xl';
  if (paramSizeGiga < 10) profile = 'small';
  else if (paramSizeGiga < 30) profile = 'medium';
  else if (paramSizeGiga < 70) profile = 'large';
  else profile = 'xl';

  const batchTools = profile !== 'xl';
  const prefetchContext = ['small', 'medium'].includes(profile);

  return {
    maxContextTokens,
    compressionThreshold,
    tokenWarningThreshold,
    defaultTemperature: 1.0,
    defaultTopK: 64,
    defaultTopP: 0.95,
    enableToolUse,
    enableVisionInput,
    maxImageResolution: enableVisionInput ? 4096 : 0,
    enableThinking,
    thinkingBudget,
    thinkingMode,
    stripThinkingHistory,
    profile,
    batchTools,
    prefetchContext,
  };
}
