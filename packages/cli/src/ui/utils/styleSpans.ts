/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ansiRegex from 'ansi-regex';
import { getCachedStringWidth } from './textUtils.js';

export interface StyleSpan {
  text: string;
  width: number;
  ansiPrefix: string;
  ansiSuffix: string;
}

export const parseToStyleSpans = (text: string): StyleSpan[] => {
  const spans: StyleSpan[] = [];
  const regex = ansiRegex();
  let match;
  let lastIndex = 0;

  let currentAnsiState: string[] = [];

  while ((match = regex.exec(text)) !== null) {
    const ansiCode = match[0];
    const matchStart = match.index;

    if (matchStart > lastIndex) {
      const chunk = text.slice(lastIndex, matchStart);
      const ansiPrefix = currentAnsiState.join('');
      spans.push({
        text: chunk,
        width: getCachedStringWidth(chunk),
        ansiPrefix,
        ansiSuffix: '\x1b[0m',
      });
    }

    if (
      ansiCode === '\x1b[0m' ||
      ansiCode === '\x1b[39m' ||
      ansiCode === '\x1b[49m' ||
      ansiCode === '\x1b[22m' ||
      ansiCode === '\x1b[23m' ||
      ansiCode === '\x1b[24m' ||
      ansiCode === '\x1b[29m'
    ) {
      if (ansiCode === '\x1b[0m') {
        currentAnsiState = [];
      } else if (ansiCode === '\x1b[39m') {
        currentAnsiState = currentAnsiState.filter(
          // eslint-disable-next-line no-control-regex
          (c) => !c.match(/\x1b\[3\d(?:;\d+)*m/),
        );
      } else if (ansiCode === '\x1b[49m') {
        currentAnsiState = currentAnsiState.filter(
          // eslint-disable-next-line no-control-regex
          (c) => !c.match(/\x1b\[4\d(?:;\d+)*m/),
        );
      } else if (ansiCode === '\x1b[22m') {
        currentAnsiState = currentAnsiState.filter(
          (c) => c !== '\x1b[1m' && c !== '\x1b[2m',
        );
      } else if (ansiCode === '\x1b[23m') {
        currentAnsiState = currentAnsiState.filter((c) => c !== '\x1b[3m');
      } else if (ansiCode === '\x1b[24m') {
        currentAnsiState = currentAnsiState.filter((c) => c !== '\x1b[4m');
      } else if (ansiCode === '\x1b[29m') {
        currentAnsiState = currentAnsiState.filter((c) => c !== '\x1b[9m');
      }
    } else {
      currentAnsiState.push(ansiCode);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk.length > 0) {
      const ansiPrefix = currentAnsiState.join('');
      spans.push({
        text: chunk,
        width: getCachedStringWidth(chunk),
        ansiPrefix,
        ansiSuffix: '\x1b[0m',
      });
    }
  }

  return spans;
};
export const styleSpansToString = (spans: StyleSpan[]): string => {
  let result = '';
  let currentAnsi = '';

  for (const span of spans) {
    if (span.ansiPrefix !== currentAnsi) {
      if (currentAnsi !== '') {
        result += '\x1b[0m';
      }
      result += span.ansiPrefix;
      currentAnsi = span.ansiPrefix;
    }
    result += span.text;
  }

  if (currentAnsi !== '') {
    result += '\x1b[0m';
  }

  return result;
};
export const styleSpansWidth = (spans: StyleSpan[]): number =>
  spans.reduce((sum, span) => sum + span.width, 0);

export const wordBreakStyleSpans = (spans: StyleSpan[]): StyleSpan[][] => {
  const words: StyleSpan[][] = [];
  let currentWord: StyleSpan[] = [];

  for (const span of spans) {
    const text = span.text;
    let i = 0;
    while (i < text.length) {
      if (text[i] === '\n' || text[i] === ' ') {
        if (currentWord.length > 0) {
          words.push(currentWord);
          currentWord = [];
        }
        words.push([
          {
            text: text[i],
            width: getCachedStringWidth(text[i]),
            ansiPrefix: span.ansiPrefix,
            ansiSuffix: span.ansiSuffix,
          },
        ]);
        i++;
      } else {
        let j = i;
        while (j < text.length && text[j] !== '\n' && text[j] !== ' ') {
          j++;
        }
        const chunk = text.substring(i, j);
        currentWord.push({
          text: chunk,
          width: getCachedStringWidth(chunk),
          ansiPrefix: span.ansiPrefix,
          ansiSuffix: span.ansiSuffix,
        });
        i = j;
      }
    }
  }

  if (currentWord.length > 0) {
    words.push(currentWord);
  }

  return words;
};

export const widestLineFromStyleSpans = (lines: StyleSpan[][]): number =>
  lines.reduce((max, line) => Math.max(max, styleSpansWidth(line)), 0);

export const wrapWord = (
  rowsRef: StyleSpan[][],
  word: StyleSpan[],
  columns: number,
) => {
  let isFirstIteration = true;

  for (const span of word) {
    let remainingText = span.text;

    while (remainingText.length > 0) {
      let rowWidth = styleSpansWidth(rowsRef[rowsRef.length - 1]);

      if (!isFirstIteration && rowWidth >= columns && columns > 0) {
        rowsRef.push([]);
        rowWidth = 0;
      }
      isFirstIteration = false;

      let splitIndex = 0;
      let chunkWidth = 0;
      const chars = Array.from(remainingText);

      for (let i = 0; i < chars.length; i++) {
        const charWidth = getCachedStringWidth(chars[i]);
        if (rowWidth + chunkWidth + charWidth > columns && columns > 0) {
          if (chunkWidth === 0 && rowWidth === 0) {
            splitIndex = 1;
            chunkWidth += charWidth;
          }
          break;
        }
        chunkWidth += charWidth;
        splitIndex++;
      }

      if (splitIndex === 0) {
        rowsRef.push([]);
        isFirstIteration = true; // reset to allow writing on next row
        continue;
      }

      const chunkText = chars.slice(0, splitIndex).join('');
      rowsRef[rowsRef.length - 1].push({
        text: chunkText,
        width: chunkWidth,
        ansiPrefix: span.ansiPrefix,
        ansiSuffix: span.ansiSuffix,
      });

      remainingText = chars.slice(splitIndex).join('');
    }
  }
};

export const wrapStyleSpans = (
  spans: StyleSpan[],
  columns: number,
): StyleSpan[][] => {
  const rows: StyleSpan[][] = [[]];
  const words = wordBreakStyleSpans(spans);
  let isAtStartOfLogicalLine = true;

  for (const word of words) {
    if (word.length === 0) continue;

    if (word[0].text === '\n') {
      rows.push([]);
      isAtStartOfLogicalLine = true;
      continue;
    }

    const wordWidth = styleSpansWidth(word);
    const rowWidth = styleSpansWidth(rows[rows.length - 1]);

    if (rowWidth + wordWidth > columns) {
      if (
        !isAtStartOfLogicalLine &&
        word[0].text === ' ' &&
        word.length === 1
      ) {
        continue;
      }

      if (!isAtStartOfLogicalLine) {
        const lastRow = rows[rows.length - 1];
        while (lastRow.length > 0 && lastRow[lastRow.length - 1].text === ' ') {
          lastRow.pop();
        }
      }

      if (wordWidth > columns) {
        if (rowWidth > 0) {
          rows.push([]);
        }
        wrapWord(rows, word, columns);
      } else {
        rows.push([]);
        rows[rows.length - 1].push(...word);
      }
    } else {
      rows[rows.length - 1].push(...word);
    }

    if (
      isAtStartOfLogicalLine &&
      !(word[0].text === ' ' && word.length === 1)
    ) {
      isAtStartOfLogicalLine = false;
    }
  }

  return rows;
};
