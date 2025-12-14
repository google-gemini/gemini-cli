/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats a number with K, M, B, T suffixes (max 2 decimal places).
 * Examples: 1234 → "1.23K", 1500000 → "1.5M", 999 → "999"
 */
export const formatCompactNumber = (num: number): string => {
  if (num < 1000) {
    return num.toString();
  }

  const suffixes = ['', 'K', 'M', 'B', 'T'];
  const tier = Math.floor(Math.log10(Math.abs(num)) / 3);
  const suffix = suffixes[Math.min(tier, suffixes.length - 1)];
  const scale = Math.pow(10, tier * 3);
  const scaled = num / scale;

  // Remove trailing zeros: 1.00 → "1", 1.50 → "1.5", 1.23 → "1.23"
  return scaled.toFixed(2).replace(/\.?0+$/, '') + suffix;
};
