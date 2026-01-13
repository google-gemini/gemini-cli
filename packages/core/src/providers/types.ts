/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported LLM providers for the CLI.
 */
export enum Provider {
  GEMINI = 'gemini',
  GLM = 'glm',
  DEEPSEEK = 'deepseek',
}

/**
 * Configuration for an LLM provider.
 */
export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  baseUrl: string;
  model: string;
  supportsThinking: boolean;
}

/**
 * Default provider configurations.
 */
export const PROVIDER_DEFAULTS: Record<
  Provider,
  Omit<ProviderConfig, 'apiKey' | 'model'>
> = {
  [Provider.GEMINI]: {
    provider: Provider.GEMINI,
    baseUrl: 'https://generativelanguage.googleapis.com',
    supportsThinking: true,
  },
  [Provider.GLM]: {
    provider: Provider.GLM,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    supportsThinking: true,
  },
  [Provider.DEEPSEEK]: {
    provider: Provider.DEEPSEEK,
    baseUrl: 'https://api.deepseek.com',
    supportsThinking: true,
  },
};

/**
 * Known GLM models.
 */
export const GLM_MODELS = new Set([
  'glm-z1-airx',
  'glm-4-plus',
  'glm-4-air',
  'glm-4-airx',
  'glm-4-long',
  'glm-4-flash',
]);

/**
 * Known DeepSeek models.
 */
export const DEEPSEEK_MODELS = new Set([
  'deepseek-reasoner',
  'deepseek-chat',
  'deepseek-coder',
]);

/**
 * Map of model names to their provider.
 */
export const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  // GLM models
  'glm-z1-airx': Provider.GLM,
  'glm-4-plus': Provider.GLM,
  'glm-4-air': Provider.GLM,
  'glm-4-airx': Provider.GLM,
  'glm-4-long': Provider.GLM,
  'glm-4-flash': Provider.GLM,
  // DeepSeek models
  'deepseek-reasoner': Provider.DEEPSEEK,
  'deepseek-chat': Provider.DEEPSEEK,
  'deepseek-coder': Provider.DEEPSEEK,
};

/**
 * Check if a model is a GLM model.
 */
export function isGLMModel(model: string): boolean {
  return GLM_MODELS.has(model) || model.startsWith('glm-');
}

/**
 * Check if a model is a DeepSeek model.
 */
export function isDeepSeekModel(model: string): boolean {
  return DEEPSEEK_MODELS.has(model) || model.startsWith('deepseek-');
}

/**
 * Get the provider for a given model.
 * Returns GEMINI for unknown models.
 */
export function getProviderForModel(model: string): Provider {
  if (MODEL_PROVIDER_MAP[model]) {
    return MODEL_PROVIDER_MAP[model];
  }
  if (isGLMModel(model)) {
    return Provider.GLM;
  }
  if (isDeepSeekModel(model)) {
    return Provider.DEEPSEEK;
  }
  return Provider.GEMINI;
}
