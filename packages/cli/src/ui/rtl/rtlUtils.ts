/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { toStyledCharacters, wrapStyledChars, styledLineToString } from 'ink';
import { bidi } from './bidi.js';

/**
 * Wraps logical text into physical lines based on the specified maxWidth.
 *
 * @param text The logical text to wrap.
 * @param maxWidth The maximum width for each line.
 * @returns An array of wrapped logical lines.
 */
export function wrapLogicalText(text: string, maxWidth: number): string[] {
  if (!text || maxWidth <= 0) return [text];
  const styledLine = toStyledCharacters(text);
  const wrappedLines = wrapStyledChars(styledLine, maxWidth);

  // Refined wrapping: Trim trailing whitespace to prevent reordering-induced displacement
  return wrappedLines.map((line) => {
    const str = styledLineToString(line);
    return str.replace(/\s+$/, '');
  });
}

/**
 * Processes text for Universal RTL/BiDi support by performing bidirectional reordering.
 *
 * This version is aware of ANSI escape codes and preserves them.
 *
 * @param text The input text potentially containing RTL characters and ANSI codes.
 * @returns The processed text with correct visual order.
 */
export function processRtlText(text: string): string {
  if (!text) return text;

  // Emergency "kill switch" for native RTL terminals
  if (
    process.env['GEMINI_NATIVE_RTL'] === 'true' ||
    process.env['GEMINI_NATIVE_RTL'] === '1'
  ) {
    return text;
  }

  const rtlRegex =
    /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (!rtlRegex.test(text)) {
    return text;
  }

  // Regex to match ANSI escape codes
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\u001b\[[0-9;]*[mGHKJKfFeDABC]/g;

  try {
    // If there are no ANSI codes, process the whole string
    if (!ansiRegex.test(text)) {
      return processPlainText(text);
    }

    // Split by ANSI codes, preserving them in the resulting array
    // eslint-disable-next-line no-control-regex
    const parts = text.split(/(\u001b\[[0-9;]*[mGHKJKfFeDABC])/);

    // Process only the non-ANSI parts
    const processedParts = parts.map((part) => {
      if (ansiRegex.test(part)) {
        return part;
      }
      return processPlainText(part);
    });

    return processedParts.join('');
  } catch {
    return text;
  }
}

/**
 * Internal helper to process plain text (no ANSI codes).
 */
function processPlainText(text: string): string {
  if (!text) return text;

  // Bidi reordering
  const embeddingLevels = bidi.getEmbeddingLevels(text);
  return bidi.getReorderedString(text, embeddingLevels);
}
