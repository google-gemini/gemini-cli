/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

export const VALID_GEMINI_MODELS = new Set([
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
]);

export const DEFAULT_GEMINI_MODEL_AUTO = 'auto';

// Model aliases for user convenience.
export const GEMINI_MODEL_ALIAS_PRO = 'pro';
export const GEMINI_MODEL_ALIAS_FLASH = 'flash';
export const GEMINI_MODEL_ALIAS_FLASH_LITE = 'flash-lite';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Cap the thinking at 8192 to prevent run-away thinking loops.
export const DEFAULT_THINKING_MODE = 8192;

/**
 * Resolves the requested model alias (e.g., 'auto', 'pro', 'flash', 'flash-lite')
 * to a concrete model name, considering preview features.
 *
 * @param requestedModel The model alias or concrete model name requested by the user.
 * @param previewFeaturesEnabled A boolean indicating if preview features are enabled.
 * @returns The resolved concrete model name.
 */
export function resolveModel(
  requestedModel: string,
  previewFeaturesEnabled: boolean | undefined,
): string {
  switch (requestedModel) {
    case DEFAULT_GEMINI_MODEL_AUTO:
    case GEMINI_MODEL_ALIAS_PRO: {
      return previewFeaturesEnabled
        ? PREVIEW_GEMINI_MODEL
        : DEFAULT_GEMINI_MODEL;
    }
    case GEMINI_MODEL_ALIAS_FLASH: {
      return DEFAULT_GEMINI_FLASH_MODEL;
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
 * Determines the effective model to use, applying fallback logic if necessary.
 *
 * When fallback mode is active, this function enforces the use of the standard
 * fallback model. However, it makes an exception for "lite" models (any model
 * with "lite" in its name), allowing them to be used to preserve cost savings.
 * This ensures that "pro" models are always downgraded, while "lite" model
 * requests are honored.
 *
 * @param isInFallbackMode Whether the application is in fallback mode.
 * @param requestedModel The model that was originally requested.
 * @param previewFeaturesEnabled A boolean indicating if preview features are enabled.
 * @returns The effective model name.
 */
export function getEffectiveModel(
  isInFallbackMode: boolean,
  requestedModel: string,
  previewFeaturesEnabled: boolean | undefined,
): string {
  const resolvedModel = resolveModel(requestedModel, previewFeaturesEnabled);

  // If we are not in fallback mode, simply use the resolved model.
  if (!isInFallbackMode) {
    return resolvedModel;
  }

  // If a "lite" model is requested, honor it. This allows for variations of
  // lite models without needing to list them all as constants.
  if (resolvedModel.includes('lite')) {
    return resolvedModel;
  }

  // Default fallback for Gemini CLI.
  return DEFAULT_GEMINI_FLASH_MODEL;
}

/**
 * Checks if the model is a Gemini 2.x model.
 *
 * @param model The model name to check.
 * @returns True if the model is a Gemini 2.x model.
 */
export function isGemini2Model(model: string): boolean {
  return /^gemini-2(\.|$)/.test(model);
}
