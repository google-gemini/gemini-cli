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
 * Regex matching characters from CJK (Chinese, Japanese, Korean) scripts,
 * CJK punctuation, and related blocks that may appear as stray noise in
 * English model thought output.
 *
 * Covered blocks:
 * - \p{Script=Han} — CJK Unified Ideographs (all planes)
 * - \p{Script=Hiragana} — Hiragana (Japanese syllabary)
 * - \p{Script=Katakana} — Katakana (Japanese syllabary)
 * - \p{Script=Hangul} — Hangul (Jamo and Syllables, Korean)
 * - \p{Script=Bopomofo} — Bopomofo (Chinese phonetics)
 * - \u2E80-\u2FDF — CJK Radicals Supplement + Kangxi Radicals
 * - \u3000-\u303F — CJK Symbols and Punctuation
 * - \u31C0-\u31EF — CJK Strokes
 * - \u3200-\u33FF — Enclosed CJK Letters and Months + CJK Compatibility
 * - \uFF00-\uFFEF — Fullwidth Forms and Halfwidth CJK
 *
 * Note: This is an intentional trade-off. Stripping CJK may affect
 * CJK-speaking users, but model thoughts are typically internal/auxiliary
 * text shown alongside primary output, and CJK fragments in an otherwise
 * English thought cause visual noise. Code snippets containing CJK are
 * unaffected because they are not rendered via parseThought.
 */
export const CJK_CHARS_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u2E80-\u2FDF\u3000-\u303F\u31C0-\u33FF\uFF00-\uFFEF]/gu;

/**
 * Strips CJK characters from the given text when they appear as sporadic noise.
 *
 * CJK characters are considered sporadic when:
 * - There are 2 or fewer CJK characters and any Latin text is present, or
 * - CJK characters make up less than 20% of the total letter characters.
 *
 * When CJK characters are dominant (≥20% of letters, or >2 chars with Latin),
 * the text is returned unchanged to preserve legitimate CJK content.
 */
export function stripCJK(text: string): string {
  if (!text) return '';
  const cjkMatches = text.match(CJK_CHARS_REGEX);
  if (!cjkMatches) return text;
  const letterMatches = text.match(/\p{L}/gu);
  const letterCount = letterMatches ? letterMatches.length : 0;
  const latinMatches = text.match(/\p{Script=Latin}/gu);
  const latinCount = latinMatches ? latinMatches.length : 0;

  const isSporadic =
    (cjkMatches.length <= 2 && latinCount > 0) ||
    (letterCount > 0 && cjkMatches.length / letterCount < 0.2);

  if (isSporadic) {
    return text.replace(CJK_CHARS_REGEX, '');
  }
  return text;
}

/**
 * Parses a raw thought string into a structured ThoughtSummary object.
 *
 * Thoughts are expected to have a bold "subject" part enclosed in double
 * asterisks (e.g., **Subject**). The rest of the string is considered
 * the description. This function only parses the first valid subject found.
 *
 * CJK characters are stripped before parsing to prevent non-English characters
 * from appearing in the thought output.
 *
 * @param rawText The raw text of the thought.
 * @returns A ThoughtSummary object. If no valid subject is found, the entire
 * string is treated as the description.
 */
export function parseThought(rawText: string): ThoughtSummary {
  const text = stripCJK(rawText).trim();
  const startIndex = text.indexOf(START_DELIMITER);
  if (startIndex === -1) {
    return { subject: '', description: text };
  }

  const endIndex = text.indexOf(
    END_DELIMITER,
    startIndex + START_DELIMITER.length,
  );
  if (endIndex === -1) {
    return { subject: '', description: text };
  }

  const subject = text
    .substring(startIndex + START_DELIMITER.length, endIndex)
    .trim();

  const description = (
    text.substring(0, startIndex) +
    text.substring(endIndex + END_DELIMITER.length)
  ).trim();

  return { subject, description };
}
