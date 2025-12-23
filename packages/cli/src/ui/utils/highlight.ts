/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transformation } from '../components/shared/text-buffer.js';
import { cpLen, cpSlice } from './textUtils.js';

export type HighlightToken = {
  text: string;
  type: 'default' | 'command' | 'file';
};

// Matches slash commands (e.g., /help) and @ references (files or MCP resource URIs).
// The @ pattern uses a negated character class to support URIs like `@file:///example.txt`
// which contain colons. It matches any character except delimiters: comma, whitespace,
// semicolon, common punctuation, and brackets.
const HIGHLIGHT_REGEX = /(^\/[a-zA-Z0-9_-]+|@(?:\\ |[^,\s;!?()[\]{}])+)/g;

export function parseInputForHighlighting(
  text: string,
  index: number,
  transformations: Transformation[] = [],
  cursorCol?: number,
): readonly HighlightToken[] {
  HIGHLIGHT_REGEX.lastIndex = 0;

  if (!text) {
    return [{ text: '', type: 'default' }];
  }

  const parseUntransformedInput = (text: string): HighlightToken[] => {
    const tokens: HighlightToken[] = [];
    if (!text) return tokens;

    HIGHLIGHT_REGEX.lastIndex = 0;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
      const [fullMatch] = match;
      const matchIndex = match.index;

      if (matchIndex > last) {
        tokens.push({ text: text.slice(last, matchIndex), type: 'default' });
      }

      const type = fullMatch.startsWith('/') ? 'command' : 'file';
      if (type === 'command' && index !== 0) {
        tokens.push({ text: fullMatch, type: 'default' });
      } else {
        tokens.push({ text: fullMatch, type });
      }

      last = matchIndex + fullMatch.length;
    }

    if (last < text.length) {
      tokens.push({ text: text.slice(last), type: 'default' });
    }

    return tokens;
  };

  const tokens: HighlightToken[] = [];

  let column = 0;
  const sortedTransformations = (transformations ?? [])
    .slice()
    .sort((a, b) => a.logStart - b.logStart);

  for (const transformation of sortedTransformations) {
    const textBeforeTransformation = cpSlice(
      text,
      column,
      transformation.logStart,
    );
    tokens.push(...parseUntransformedInput(textBeforeTransformation));

    const isCursorInside =
      typeof cursorCol === 'number' &&
      cursorCol >= transformation.logStart &&
      cursorCol <= transformation.logEnd;
    const transformationText = isCursorInside
      ? transformation.logicalText
      : transformation.collapsedText;
    tokens.push({ text: transformationText, type: 'file' });

    column = transformation.logEnd;
  }

  const textAfterFinalTransformation = cpSlice(text, column);
  tokens.push(...parseUntransformedInput(textAfterFinalTransformation));
  return tokens;
}

export function parseSegmentsFromTokens(
  tokens: readonly HighlightToken[],
  sliceStart: number,
  sliceEnd: number,
): readonly HighlightToken[] {
  if (sliceStart >= sliceEnd) return [];

  const segments: HighlightToken[] = [];
  let tokenCpStart = 0;

  for (const token of tokens) {
    const tokenLen = cpLen(token.text);
    const tokenStart = tokenCpStart;
    const tokenEnd = tokenStart + tokenLen;

    const overlapStart = Math.max(tokenStart, sliceStart);
    const overlapEnd = Math.min(tokenEnd, sliceEnd);
    if (overlapStart < overlapEnd) {
      const sliceStartInToken = overlapStart - tokenStart;
      const sliceEndInToken = overlapEnd - tokenStart;
      const rawSlice = cpSlice(token.text, sliceStartInToken, sliceEndInToken);

      const last = segments[segments.length - 1];
      if (last && last.type === token.type) {
        last.text += rawSlice;
      } else {
        segments.push({ type: token.type, text: rawSlice });
      }
    }

    tokenCpStart += tokenLen;
  }
  return segments;
}
