/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import prettier from 'prettier';

export async function formatWithPrettier(content: string, filePath: string) {
  const options = await prettier.resolveConfig(filePath);
  return prettier.format(content, {
    ...options,
    filepath: filePath,
  });
}

export function normalizeForCompare(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd();
}

export function escapeBackticks(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

export interface FormatDefaultValueOptions {
  /**
   * When true, string values are JSON-stringified, including surrounding quotes.
   * Defaults to false to return raw string content.
   */
  quoteStrings?: boolean;
}

export function formatDefaultValue(
  value: unknown,
  options: FormatDefaultValueOptions = {},
): string {
  const { quoteStrings = false } = options;

  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return quoteStrings ? JSON.stringify(value) : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value, null, 2);
      if (json === '{}') {
        return '{}';
      }
      return json;
    } catch {
      return '[object Object]';
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface MarkerInsertionOptions {
  document: string;
  startMarker: string;
  endMarker: string;
  newContent: string;
  paddingBefore?: string;
  paddingAfter?: string;
}

/**
 * Replaces the content between two markers with `newContent`, preserving the
 * original document outside the markers and applying optional padding.
 */
export function injectBetweenMarkers({
  document,
  startMarker,
  endMarker,
  newContent,
  paddingBefore = '\n',
  paddingAfter = '\n',
}: MarkerInsertionOptions): string {
  const startIndex = document.indexOf(startMarker);
  const endIndex = document.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error(
      `Could not locate documentation markers (${startMarker}, ${endMarker}).`,
    );
  }

  const before = document.slice(0, startIndex + startMarker.length);
  const after = document.slice(endIndex);

  return `${before}${paddingBefore}${newContent}${paddingAfter}${after}`;
}
