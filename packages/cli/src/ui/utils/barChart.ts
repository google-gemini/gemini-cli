/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates an ASCII bar string for terminal display.
 * @param fraction Value between 0 and 1 representing the proportion to fill
 * @param totalWidth Total width of the bar in characters
 * @returns Object with filled and empty character counts
 */
export function buildBar(
  fraction: number,
  totalWidth = 20,
): { filled: number; empty: number } {
  const clamped = Math.max(0, Math.min(1, fraction));
  let filled = Math.round(clamped * totalWidth);

  // If something is used (fraction > 0) but rounds to 0, show 1 tick.
  if (clamped > 0 && clamped < 1) {
    filled = Math.min(Math.max(filled, 1), totalWidth - 1);
  }

  const empty = Math.max(0, totalWidth - filled);
  return { filled, empty };
}

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
