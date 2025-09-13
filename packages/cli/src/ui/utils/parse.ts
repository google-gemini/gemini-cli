/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type HighlightToken = {
  text: string;
  type: 'default' | 'command' | 'file' | 'placeholder';
};

const HIGHLIGHT_REGEX = /(^\/[a-zA-Z0-9_-]+|@(?:\\ |[a-zA-Z0-9_./-])+)/g;

// Single‑pass scanner for bracketed placeholders: [ ... ] with no nested [ or ] inside
export function findPlaceholderCandidates(
  text: string,
  placeholders: ReadonlySet<string>,
): Array<{ start: number; end: number; text: string }> {
  const res: Array<{ start: number; end: number; text: string }> = [];
  if (!text || placeholders.size === 0) return res;
  const textLength = text.length;
  let i = 0;
  while (i < textLength) {
    if (text[i] !== '[') {
      i++;
      continue;
    }
    let j = i + 1;
    let nestedSquareBrackets = false;
    for (j; j < textLength; j++) {
      const char = text[j];
      if (char === '[') {
        nestedSquareBrackets = true;
        break;
      }
      if (char === ']') {
        const candidate = text.slice(i, j + 1);
        if (placeholders.has(candidate)) {
          res.push({ start: i, end: j + 1, text: candidate });
          i = j + 1;
          break;
        } else {
          // not a known placeholder; treat '[' as normal and continue scanning after it
          i++;
          break;
        }
      }
    }
    if (j >= textLength || nestedSquareBrackets) {
      // no closing ']' or nested '[', advance
      i++;
    }
  }
  return res;
}

export function parseInputForHighlighting(
  text: string,
  index: number,
  placeholders: readonly string[] = [],
): readonly HighlightToken[] {
  if (!text) {
    return [{ text: '', type: 'default' }];
  }

  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
    const [fullMatch] = match;
    const matchIndex = match.index;

    // Add the text before the match as a default token
    if (matchIndex > lastIndex) {
      tokens.push({
        text: text.slice(lastIndex, matchIndex),
        type: 'default',
      });
    }

    // Add the matched token
    const type = fullMatch.startsWith('/') ? 'command' : 'file';
    // Only highlight slash commands if the index is 0.
    if (type === 'command' && index !== 0) {
      tokens.push({
        text: fullMatch,
        type: 'default',
      });
    } else {
      tokens.push({
        text: fullMatch,
        type,
      });
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    tokens.push({
      text: text.slice(lastIndex),
      type: 'default',
    });
  }

  const phSet = new Set(placeholders);
  const nextTokens: HighlightToken[] = [];
  for (const token of tokens) {
    if (token.type !== 'default') {
      nextTokens.push(token);
      continue;
    }
    const ranges = findPlaceholderCandidates(token.text, phSet);
    if (ranges.length === 0) {
      nextTokens.push(token);
      continue;
    }
    let cur = 0;
    for (const r of ranges) {
      if (r.start > cur) {
        nextTokens.push({
          text: token.text.slice(cur, r.start),
          type: 'default',
        });
      }
      nextTokens.push({
        text: token.text.slice(r.start, r.end),
        type: 'placeholder',
      });
      cur = r.end;
    }
    if (cur < token.text.length) {
      nextTokens.push({ text: token.text.slice(cur), type: 'default' });
    }
  }
  return nextTokens;
}
