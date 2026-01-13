/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview';
export const PREVIEW_GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

export const VALID_GEMINI_MODELS = new Set([
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
]);

export const PREVIEW_GEMINI_MODEL_AUTO = 'auto-gemini-3';
export const DEFAULT_GEMINI_MODEL_AUTO = 'auto-gemini-2.5';

// Model aliases for user convenience.
export const GEMINI_MODEL_ALIAS_AUTO = 'auto';
export const GEMINI_MODEL_ALIAS_PRO = 'pro';
export const GEMINI_MODEL_ALIAS_FLASH = 'flash';
export const GEMINI_MODEL_ALIAS_FLASH_LITE = 'flash-lite';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Cap the thinking at 8192 to prevent run-away thinking loops.
export const DEFAULT_THINKING_MODE = 8192;

/**
 * Resolves the requested model alias (e.g., 'auto-gemini-3', 'pro', 'flash', 'flash-lite')
 * to a concrete model name, considering preview features.
 *
 * @param requestedModel The model alias or concrete model name requested by the user.
 * @param previewFeaturesEnabled A boolean indicating if preview features are enabled.
 * @returns The resolved concrete model name.
 */
export function resolveModel(
  requestedModel: string,
  previewFeaturesEnabled: boolean = false,
): string {
  switch (requestedModel) {
    case PREVIEW_GEMINI_MODEL_AUTO: {
      return PREVIEW_GEMINI_MODEL;
    }
    case DEFAULT_GEMINI_MODEL_AUTO: {
      return DEFAULT_GEMINI_MODEL;
    }
    case GEMINI_MODEL_ALIAS_PRO: {
      return previewFeaturesEnabled
        ? PREVIEW_GEMINI_MODEL
        : DEFAULT_GEMINI_MODEL;
    }
    case GEMINI_MODEL_ALIAS_FLASH: {
      return previewFeaturesEnabled
        ? PREVIEW_GEMINI_FLASH_MODEL
        : DEFAULT_GEMINI_FLASH_MODEL;
    }
    case GEMINI_MODEL_ALIAS_FLASH_LITE: {
      return DEFAULT_GEMINI_FLASH_LITE_MODEL;
    }
    default: {
      return requestedModel;
    }
  }
}

/**
 * Resolves the appropriate model based on the classifier's decision.
 *
 * @param requestedModel The current requested model (e.g. auto-gemini-2.5).
 * @param modelAlias The alias selected by the classifier ('flash' or 'pro').
 * @param previewFeaturesEnabled Whether preview features are enabled.
 * @returns The resolved concrete model name.
 */
export function resolveClassifierModel(
  requestedModel: string,
  modelAlias: string,
  previewFeaturesEnabled: boolean = false,
): string {
  if (modelAlias === GEMINI_MODEL_ALIAS_FLASH) {
    if (
      requestedModel === DEFAULT_GEMINI_MODEL_AUTO ||
      requestedModel === DEFAULT_GEMINI_MODEL
    ) {
      return DEFAULT_GEMINI_FLASH_MODEL;
    }
    if (
      requestedModel === PREVIEW_GEMINI_MODEL_AUTO ||
      requestedModel === PREVIEW_GEMINI_MODEL
    ) {
      return PREVIEW_GEMINI_FLASH_MODEL;
    }
    return resolveModel(GEMINI_MODEL_ALIAS_FLASH, previewFeaturesEnabled);
  }
  return resolveModel(requestedModel, previewFeaturesEnabled);
}
export function getDisplayString(
  model: string,
  previewFeaturesEnabled: boolean = false,
) {
  switch (model) {
    case PREVIEW_GEMINI_MODEL_AUTO:
      return 'Auto (Gemini 3)';
    case DEFAULT_GEMINI_MODEL_AUTO:
      return 'Auto (Gemini 2.5)';
    case GEMINI_MODEL_ALIAS_PRO:
      return previewFeaturesEnabled
        ? PREVIEW_GEMINI_MODEL
        : DEFAULT_GEMINI_MODEL;
    case GEMINI_MODEL_ALIAS_FLASH:
      return previewFeaturesEnabled
        ? PREVIEW_GEMINI_FLASH_MODEL
        : DEFAULT_GEMINI_FLASH_MODEL;
    default:
      return model;
  }
}

/**
 * Checks if the model is a preview model.
 *
 * @param model The model name to check.
 * @returns True if the model is a preview model.
 */
export function isPreviewModel(model: string): boolean {
  return (
    model === PREVIEW_GEMINI_MODEL ||
    model === PREVIEW_GEMINI_FLASH_MODEL ||
    model === PREVIEW_GEMINI_MODEL_AUTO
  );
}

/**
 * Checks if the model is a Gemini 2.x model.
 *
 * @param model The model name to check.
 * @returns True if the model is a Gemini-2.x model.
 */
export function isGemini2Model(model: string): boolean {
  return /^gemini-2(\.|$)/.test(model);
}

/**
 * Checks if the model is an auto model.
 *
 * @param model The model name to check.
 * @returns True if the model is an auto model.
 */
export function isAutoModel(model: string): boolean {
  return (
    model === GEMINI_MODEL_ALIAS_AUTO ||
    model === PREVIEW_GEMINI_MODEL_AUTO ||
    model === DEFAULT_GEMINI_MODEL_AUTO
  );
}

/**
 * Checks if the model supports multimodal function responses (multimodal data nested within function response).
 * This is supported in Gemini 3.
 *
 * @param model The model name to check.
 * @returns True if the model supports multimodal function responses.
 */
export function supportsMultimodalFunctionResponse(model: string): boolean {
  return model.startsWith('gemini-3-');
}

// ============ GLM Models ============

export const DEFAULT_GLM_MODEL = 'glm-z1-airx';

export const GLM_MODELS = new Set([
  'glm-z1-airx',
  'glm-4-plus',
  'glm-4-air',
  'glm-4-airx',
  'glm-4-long',
  'glm-4-flash',
]);

/**
 * Checks if the model is a GLM model.
 *
 * @param model The model name to check.
 * @returns True if the model is a GLM model.
 */
export function isGLMModel(model: string): boolean {
  return GLM_MODELS.has(model) || model.startsWith('glm-');
}

// ============ DeepSeek Models ============

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-reasoner';

export const DEEPSEEK_MODELS = new Set([
  'deepseek-reasoner',
  'deepseek-chat',
  'deepseek-coder',
]);

/**
 * Checks if the model is a DeepSeek model.
 *
 * @param model The model name to check.
 * @returns True if the model is a DeepSeek model.
 */
export function isDeepSeekModel(model: string): boolean {
  return DEEPSEEK_MODELS.has(model) || model.startsWith('deepseek-');
}

// ============ Provider Detection ============

export type ModelProvider = 'gemini' | 'glm' | 'deepseek';

/**
 * Determines the provider for a given model.
 *
 * @param model The model name to check.
 * @returns The provider name ('gemini', 'glm', or 'deepseek').
 */
export function getProviderForModel(model: string): ModelProvider {
  if (isGLMModel(model)) return 'glm';
  if (isDeepSeekModel(model)) return 'deepseek';
  return 'gemini';
}
