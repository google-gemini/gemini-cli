/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

// Extended model support for autonomous operation
export const GEMINI_2_5_PRO_THINKING = 'gemini-2.5-pro-thinking';
export const GEMINI_2_5_DEEP_RESEARCH = 'gemini-2.5-deep-research';
export const GEMINI_3_PRO = 'gemini-3.0-pro';
export const GEMINI_3_THINKING = 'gemini-3.0-thinking';

export const DEFAULT_GEMINI_MODEL_AUTO = 'auto';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Some thinking models do not default to dynamic thinking which is done by a value of -1
export const DEFAULT_THINKING_MODE = -1;

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
 * @returns The effective model name.
 */
export function getEffectiveModel(
  isInFallbackMode: boolean,
  requestedModel: string,
): string {
  // If we are not in fallback mode, simply use the requested model.
  if (!isInFallbackMode) {
    return requestedModel;
  }

  // If a "lite" model is requested, honor it. This allows for variations of
  // lite models without needing to list them all as constants.
  if (requestedModel.includes('lite')) {
    return requestedModel;
  }

  // Default fallback for Gemini CLI.
  return DEFAULT_GEMINI_FLASH_MODEL;
}
