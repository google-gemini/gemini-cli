/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OmissionPlaceholderDetectionResult {
  found: boolean;
  match?: string;
}

const STANDALONE_OMISSION_LINE_PATTERN =
  /^(?:\/\/\s*)?\(?\s*(?:rest\s+of(?:\s+(?:methods?|code))?|unchanged\s+(?:code|methods?))\s*\.{3,}\s*\)?$/i;

/**
 * Detects shorthand omission placeholders such as:
 * - (rest of methods ...)
 * - (rest of code ...)
 * - (unchanged code ...)
 * - // rest of methods ...
 */
export function detectOmissionPlaceholder(
  text: string,
): OmissionPlaceholderDetectionResult {
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (!line.includes('...')) {
      continue;
    }

    if (
      !/rest\s+of/i.test(line) &&
      !/unchanged\s+(?:code|methods?)/i.test(line)
    ) {
      continue;
    }

    if (STANDALONE_OMISSION_LINE_PATTERN.test(line)) {
      return { found: true, match: line };
    }
  }

  return { found: false };
}
