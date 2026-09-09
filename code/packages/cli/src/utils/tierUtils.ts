/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if the given tier name corresponds to an "Ultra" tier.
 *
 * @param tierName The name of the user's tier.
 * @returns True if the tier is an "Ultra" tier, false otherwise.
 */
export function isUltraTier(tierName?: string): boolean {
  return !!tierName?.toLowerCase().includes('ultra');
}
