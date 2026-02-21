/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const bytesToMB = (bytes: number): number => bytes / (1024 * 1024);

export const formatBytes = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${bytesToMB(bytes).toFixed(1)} MB`;
  }
  return `${gb.toFixed(2)} GB`;
};

/**
 * Formats a duration given in milliseconds into a concise human-readable string.
 *
 * Examples:
 *   formatDuration(0)        => '0ms'
 *   formatDuration(450)      => '450ms'
 *   formatDuration(1500)     => '1.5s'
 *   formatDuration(90000)    => '1m 30s'
 *   formatDuration(3661000)  => '1h 1m 1s'
 *
 * @param ms - Duration in milliseconds (must be >= 0).
 * @returns A human-readable duration string.
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    ms = 0;
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const totalSeconds = Math.floor(ms / 1000);

  if (totalSeconds < 60) {
    const fractional = ms / 1000;
    // Show one decimal place only when there is a meaningful fractional part.
    if (ms % 1000 !== 0) {
      return `${fractional.toFixed(1)}s`;
    }
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}
