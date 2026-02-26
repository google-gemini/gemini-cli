/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Transformation,
  PASTED_TEXT_PLACEHOLDER_REGEX,
} from '../components/shared/text-buffer.js';
import { LRUCache } from 'mnemonist';
import { cpLen, cpSlice } from './textUtils.js';
import { LRU_BUFFER_PERF_CACHE_LIMIT } from '../constants.js';
import { AT_COMMAND_PATH_REGEX_SOURCE } from '../hooks/atCommandProcessor.js';

export type HighlightToken = {
  text: string;
  type: 'default' | 'command' | 'file' | 'paste';
};

// Matches slash commands (e.g., /help), @ references (files or MCP resource URIs),
// and large paste placeholders (e.g., [Pasted Text: 6 lines]).
//
// The @ pattern uses the same source as the command processor to ensure consistency.
// It matches any character except strict delimiters (ASCII whitespace, comma, etc.).
// This supports URIs like `@file:///example.txt` and filenames with Unicode spaces (like NNBSP).
const HIGHLIGHT_REGEX = new RegExp(
  `(^/[a-zA-Z0-9_-]+|@${AT_COMMAND_PATH_REGEX_SOURCE}|${PASTED_TEXT_PLACEHOLDER_REGEX.source})`,
  'g',
);

const highlightCache = new LRUCache<string, readonly HighlightToken[]>(
  LRU_BUFFER_PERF_CACHE_LIMIT,
);

export function parseInputForHighlighting(
  text: string,
  index: number,
  transformations: Transformation[] = [],
  cursorCol?: number,
): readonly HighlightToken[] {
  let isCursorInsideTransform = false;
  if (cursorCol !== undefined) {
    for (const transform of transformations) {
      if (cursorCol >= transform.logStart && cursorCol <= transform.logEnd) {
        isCursorInsideTransform = true;
        break;
      }
    }
  }

  const cacheKey = `${index === 0 ? 'F' : 'N'}:${isCursorInsideTransform ? cursorCol : 'NC'}:${text}`;
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

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

      const type = fullMatch.startsWith('/')
        ? 'command'
        : fullMatch.startsWith('@')
          ? 'file'
          : 'paste';
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
      cursorCol !== undefined &&
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

  highlightCache.set(cacheKey, tokens);

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
