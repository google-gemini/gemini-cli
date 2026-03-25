/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const TRUNCATION_SUFFIX = '... (truncated for performance)';

/**
 * Overload signatures: These tell TypeScript exactly what to expect.
 */
export function safeTruncate(val: string, limit: number): string;
export function safeTruncate(val: unknown, limit: number): unknown;

/**
 * The actual implementation.
 */
export function safeTruncate(val: unknown, limit: number): unknown {
  if (typeof val !== 'string') {
    return val;
  }

  if (val.length <= limit) {
    return val;
  }

  if (limit <= TRUNCATION_SUFFIX.length) {
    return val.substring(0, limit);
  }

  const truncateAt = limit - TRUNCATION_SUFFIX.length;
  return val.substring(0, truncateAt) + TRUNCATION_SUFFIX;
}