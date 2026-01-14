/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const formatMemoryUsage = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${gb.toFixed(2)} GB`;
};

/**
 * Formats a duration in milliseconds into a concise, human-readable string (e.g., "1h 5s").
 * It omits any time units that are zero.
 * @param milliseconds The duration in milliseconds.
 * @returns A formatted string representing the duration.
 */
export const formatDuration = (milliseconds: number): string => {
  if (milliseconds <= 0) {
    return '0s';
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }

  const totalSeconds = milliseconds / 1000;

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0) {
    parts.push(`${seconds}s`);
  }

  // If all parts are zero (e.g., exactly 1 hour), return the largest unit.
  if (parts.length === 0) {
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  return parts.join(' ');
};

export const formatTimeAgo = (date: string | number | Date): string => {
  const past = new Date(date);
  if (isNaN(past.getTime())) {
    return 'invalid date';
  }

  const now = new Date();
  const diffMs = now.getTime() - past.getTime();
  if (diffMs < 60000) {
    return 'just now';
  }
  return `${formatDuration(diffMs)} ago`;
};

const REFERENCE_CONTENT_START = '--- Content from referenced files ---';
const REFERENCE_CONTENT_END = '--- End of content ---';

/**
 * Removes content bounded by reference content markers from the given text.
 * The markers are "--- Content from referenced files ---" and "--- End of content ---".
 *
 * @param text The input text containing potential reference blocks.
 * @returns The text with reference blocks removed and trimmed.
 */
export function stripReferenceContent(text: string): string {
  // Match optional newline, the start marker, content (non-greedy), and the end marker
  const pattern = new RegExp(
    `\\n?${REFERENCE_CONTENT_START}[\\s\\S]*?${REFERENCE_CONTENT_END}`,
    'g',
  );

  return text.replace(pattern, '').trim();
}
