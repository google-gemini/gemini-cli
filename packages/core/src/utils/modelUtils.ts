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
