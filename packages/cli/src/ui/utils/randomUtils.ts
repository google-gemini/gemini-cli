/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomInt } from 'node:crypto';

/**
 * Returns a cryptographically secure random integer between min (inclusive) and max (exclusive).
 * Using node:crypto satisfies security scanners while providing a mockable interface for tests.
 */
export function getSecureRandomInt(min: number, max: number): number {
  return randomInt(min, max);
}
