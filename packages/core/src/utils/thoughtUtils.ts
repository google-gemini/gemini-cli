/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThoughtSummary = {
  subject: string;
  description: string;
};

const START_DELIMITER = '**';
const END_DELIMITER = '**';

/**
 * Parses a raw thought string into a structured ThoughtSummary object.
 *
 * Thoughts are expected to have a bold "subject" part enclosed in double
 * asterisks (e.g., **Subject**). The rest of the string is considered
 * the description. This function only parses the first valid subject found.
 *
 * @param rawText The raw text of the thought.
 * @returns A ThoughtSummary object. If no valid subject is found, the entire
 * string is treated as the description.
 */
export function parseThought(rawText: string): ThoughtSummary {
  const startIndex = rawText.indexOf(START_DELIMITER);
  if (startIndex === -1) {
    // No start delimiter found, the whole text is the description.
    return { subject: '', description: rawText.trim() };
  }

  const endIndex = rawText.indexOf(
    END_DELIMITER,
    startIndex + START_DELIMITER.length,
  );
  if (endIndex === -1) {
    // Start delimiter found but no end delimiter, so it's not a valid subject.
    // Treat the entire string as the description.
    return { subject: '', description: rawText.trim() };
  }

  const subject = rawText
    .substring(startIndex + START_DELIMITER.length, endIndex)
    .trim();

  // The description is everything before the start delimiter and after the end delimiter.
  const description = (
    rawText.substring(0, startIndex) +
    rawText.substring(endIndex + END_DELIMITER.length)
  ).trim();

  return { subject, description };
}
