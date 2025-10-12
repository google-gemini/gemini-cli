/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Linearly interpolates between two values.
 *
 * @param start The start value.
 * @param end The end value.
 * @param t The interpolation amount (typically between 0 and 1).
 */
export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;
