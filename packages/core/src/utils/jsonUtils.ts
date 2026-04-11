/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Attempts to extract and parse a JSON object or array from a string that may
 * contain conversational filler or markdown code blocks.
 *
 * @param text The text to extract JSON from.
 * @returns The parsed JSON object or array as unknown.
 * @throws SyntaxError if no valid JSON is found.
 */
export function extractAndParseJson(text: string): unknown {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let start = -1;
  let end = -1;

  // Determine if we should look for an object or an array first based on which starts earlier.
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = text.lastIndexOf(']');
  }

  if (start === -1 || end === -1 || end <= start) {
    // Fallback: try parsing the whole trimmed text.
    return JSON.parse(text.trim());
  }

  const cleanJson = text.substring(start, end + 1);
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    // If extraction failed to produce valid JSON (e.g. mismatched braces),
    // try the whole text as a last resort.
    try {
      return JSON.parse(text.trim());
    } catch {
      throw e;
    }
  }
}
