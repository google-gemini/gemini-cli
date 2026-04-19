/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const TRUNCATION_SUFFIX = '... (truncated for performance)';

export function safeTruncate(val: string, limit: number): string;
export function safeTruncate(val: unknown, limit: number): unknown;
export function safeTruncate(val: unknown, limit: number): unknown {
  if (typeof val !== 'string' || val.length <= limit) {
    return val;
  }

  // Use Array.from to count actual characters (graphemes) instead of UTF-16 units
  const characters = Array.from(val);
  if (characters.length <= limit) {
    return val;
  }

  const truncateAt = Math.max(0, limit - TRUNCATION_SUFFIX.length);
  return characters.slice(0, truncateAt).join('') + TRUNCATION_SUFFIX;
}
