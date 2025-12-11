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
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
]);

export const PREVIEW_GEMINI_MODEL_AUTO = 'auto-gemini-3';
export const DEFAULT_GEMINI_MODEL_AUTO = 'auto-gemini-2.5';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Cap the thinking at 8192 to prevent run-away thinking loops.
export const DEFAULT_THINKING_MODE = 8192;

/**
 * Determines the effective model to use, applying fallback logic if necessary.
 *
 * When fallback mode is active, this function enforces the use of the standard
 * fallback model.
 *
 * @param requestedModel The model that was originally requested.
 * @param isInFallbackMode Whether the application is in fallback mode.
 * @returns The effective model name.
 */
export function getEffectiveModel(
  requestedModel: string,
  useFallbackModel: boolean,
): string {
  // If we are not in fallback mode, simply use the resolved model.
  if (!useFallbackModel) {
    switch (requestedModel) {
      case PREVIEW_GEMINI_MODEL_AUTO:
        return PREVIEW_GEMINI_MODEL;
      case DEFAULT_GEMINI_MODEL_AUTO:
        return DEFAULT_GEMINI_MODEL;
      default:
        return requestedModel;
    }
  }

  // Fallback model for corresponding model family. We are doing fallback only
  // for Auto modes
  switch (requestedModel) {
    case PREVIEW_GEMINI_MODEL_AUTO:
      return PREVIEW_GEMINI_FLASH_MODEL;
    case DEFAULT_GEMINI_MODEL_AUTO:
      return DEFAULT_GEMINI_FLASH_MODEL;
    default:
      return requestedModel;
  }
}

export function getDisplayString(model: string) {
  switch (model) {
    case PREVIEW_GEMINI_MODEL_AUTO:
      return 'Auto (Gemini 3)';
    case DEFAULT_GEMINI_MODEL_AUTO:
      return 'Auto (Gemini 2.5)';
    default:
      return model;
  }
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
