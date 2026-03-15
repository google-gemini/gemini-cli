/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@google/gemini-cli-core';

/**
 * Checks if the user has access to a "Pro" model (non-free).
 * This is determined by the PRO_MODEL_ACCESS experiment flag.
 *
 * If experiments are missing or empty, this returns true.
 *
 * @param config The global runtime configuration.
 * @returns True if the user has access to Pro models, false otherwise.
 */
export function hasAccessToProModel(config?: Config | null): boolean {
  if (!config || typeof config.getHasProModelAccessSync !== 'function') {
    return false;
  }
  return config.getHasProModelAccessSync();
}

/**
 * Checks if the given tier name or config corresponds to an "Ultra" tier.
 *
 * @param tierOrConfig The name of the user's tier or the config object.
 * @returns True if the tier is an "Ultra" tier, false otherwise.
 */
export function isUltraTier(tierOrConfig?: string | Config | null): boolean {
  if (!tierOrConfig) {
    return false;
  }
  if (typeof tierOrConfig === 'string') {
    return tierOrConfig.toLowerCase().includes('ultra');
  }
  if (typeof tierOrConfig.getUserTierName === 'function') {
    return isUltraTier(tierOrConfig.getUserTierName());
  }
  return false;
}
