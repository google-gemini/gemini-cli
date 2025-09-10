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

  if (placeholders.length === 0) return tokens;

  const nextTokens: HighlightToken[] = [];
  for (const token of tokens) {
    if (token.type !== 'default') {
      nextTokens.push(token);
      continue;
    }
    // Find the segments of the token that match the placeholders
    const segments: Array<{ start: number; end: number }> = [];
    for (const placeholder of placeholders) {
      if (!placeholder) continue;
      let from = 0;
      while (from <= token.text.length) {
        const idx = token.text.indexOf(placeholder, from);
        if (idx === -1) break;
        segments.push({ start: idx, end: idx + placeholder.length });
        from = idx + placeholder.length;
      }
    }
    if (segments.length === 0) {
      nextTokens.push(token);
      continue;
    }
    segments.sort((a, b) => a.start - b.start);
    // Keep only the segments that are not overlapping
    const keptSegments: Array<{ start: number; end: number }> = [];
    let lastEnd = -1;
    for (const seg of segments) {
      if (seg.start >= lastEnd) {
        keptSegments.push(seg);
        lastEnd = seg.end;
      }
    }

    let currentCursor = 0;
    for (const seg of keptSegments) {
      if (seg.start > currentCursor) {
        nextTokens.push({
          text: token.text.slice(currentCursor, seg.start),
          type: 'default',
        });
      }
      nextTokens.push({
        text: token.text.slice(seg.start, seg.end),
        type: 'placeholder',
      });
      currentCursor = seg.end;
    }
    if (currentCursor < token.text.length) {
      nextTokens.push({
        text: token.text.slice(currentCursor),
        type: 'default',
      });
    }
  }
  return nextTokens;
}
