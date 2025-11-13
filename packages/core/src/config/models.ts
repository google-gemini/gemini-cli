/**
 * @license
 * Copyright 2025 Google LLC
 * Modified for LM Studio integration
 * SPDX-License-Identifier: Apache-2.0
 */

// LM Studio model defaults
export const DEFAULT_GEMINI_MODEL = 'local-model';
export const DEFAULT_GEMINI_FLASH_MODEL = 'local-model';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'local-model';

export const DEFAULT_GEMINI_MODEL_AUTO = 'auto';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'text-embedding-ada-002';

// Extended thinking support for reasoning models (e.g., DeepSeek R1, QwQ)
// Increased to 32768 to support models that do extensive reasoning
export const DEFAULT_THINKING_MODE = 32768;
export const MAX_THINKING_TOKENS = 65536; // Support for very thorough reasoning

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
