/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Strips the 'models/' prefix from a model ID if present.
 * This ensures internal logic (like family matching) works correctly
 * even when receiving formal resource names from the API.
 *
 * @param modelId The model identifier to normalize.
 * @returns The model ID without the 'models/' prefix.
 */
export function normalizeModelId(modelId: string): string {
  return modelId.startsWith('models/') ? modelId.slice(7) : modelId;
}

/**
 * Strips 'models/' prefix and maps variant/equivalent model names
 * (such as concrete vs. abstract aliases for Gemini 3.1 Pro/Flash) to their
 * base canonical representation.
 */
export function getCanonicalModelAlias(modelId: string): string {
  const norm = normalizeModelId(modelId);
  if (
    norm === 'gemini-3.1-pro-preview' ||
    norm === 'gemini-3-pro-preview' ||
    norm === 'gemini-3.1-pro-preview-custom-tools' ||
    norm === 'gemini-3.1-pro-preview-customtools'
  ) {
    return 'gemini-3-pro-preview';
  }
  if (
    norm === 'gemini-3-flash-preview' ||
    norm === 'gemini-3-flash-preview-0526' ||
    norm === 'gemini-3-flash-preview-customtools'
  ) {
    return 'gemini-3-flash-preview';
  }
  return norm;
}
