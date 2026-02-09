/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import pathMod from 'node:path';
import * as path from 'node:path';
import { useState, useCallback, useEffect, useMemo, useReducer } from 'react';
import { LRUCache } from 'mnemonist';
import {
  coreEvents,
  CoreEvent,
  debugLogger,
  unescapePath,
  type EditorType,
  getEditorCommand,
  isGuiEditor,
} from '@google/gemini-cli-core';
import {
  toCodePoints,
  cpLen,
  cpSlice,
  stripUnsafeCharacters,
  getCachedStringWidth,
} from '../../utils/textUtils.js';
import { parsePastedPaths } from '../../utils/clipboardUtils.js';
import type { Key } from '../../contexts/KeypressContext.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import type { VimAction } from './vim-buffer-actions.js';
import { handleVimAction } from './vim-buffer-actions.js';
import { LRU_BUFFER_PERF_CACHE_LIMIT } from '../../constants.js';

const LARGE_PASTE_LINE_THRESHOLD = 5;
const LARGE_PASTE_CHAR_THRESHOLD = 500;

// Regex to match paste placeholders like [Pasted Text: 6 lines] or [Pasted Text: 501 chars #2]
export const PASTED_TEXT_PLACEHOLDER_REGEX =
  /\[Pasted Text: \d+ (?:lines|chars)(?: #\d+)?\]/g;

export type Direction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wordLeft'
  | 'wordRight'
  | 'home'
  | 'end';

// Helper functions for line-based word navigation
export const isWordCharStrict = (char: string): boolean =>
  /[\w\p{L}\p{N}]/u.test(char); // Matches a single character that is any Unicode letter, any Unicode number, or an underscore

export const isWhitespace = (char: string): boolean => /\s/.test(char);

// Check if a character is a combining mark (only diacritics for now)
export const isCombiningMark = (char: string): boolean => /\p{M}/u.test(char);

// Check if a character should be considered part of a word (including combining marks)
export const isWordCharWithCombining = (char: string): boolean =>
  isWordCharStrict(char) || isCombiningMark(char);

// Get the script of a character (simplified for common scripts)
export const getCharScript = (char: string): string => {
  if (/[\p{Script=Latin}]/u.test(char)) return 'latin'; // All Latin script chars including diacritics
  if (/[\p{Script=Han}]/u.test(char)) return 'han'; // Chinese
  if (/[\p{Script=Arabic}]/u.test(char)) return 'arabic';
  if (/[\p{Script=Hiragana}]/u.test(char)) return 'hiragana';
  if (/[\p{Script=Katakana}]/u.test(char)) return 'katakana';
  if (/[\p{Script=Cyrillic}]/u.test(char)) return 'cyrillic';
  return 'other';
};

// Check if two characters are from different scripts (indicating word boundary)
export const isDifferentScript = (char1: string, char2: string): boolean => {
  if (!isWordCharStrict(char1) || !isWordCharStrict(char2)) return false;
  return getCharScript(char1) !== getCharScript(char2);
};

// Find next word start within a line, starting from col
export const findNextWordStartInLine = (
  line: string,
  col: number,
): number | null => {
  const chars = toCodePoints(line);
  let i = col;

  if (i >= chars.length) return null;

  const currentChar = chars[i];

  // Skip current word/sequence based on character type
  if (isWordCharStrict(currentChar)) {
    while (i < chars.length && isWordCharWithCombining(chars[i])) {
      // Check for script boundary - if next character is from different script, stop here
      if (
        i + 1 < chars.length &&
        isWordCharStrict(chars[i + 1]) &&
        isDifferentScript(chars[i], chars[i + 1])
      ) {
        i++; // Include current character
        break; // Stop at script boundary
      }
      i++;
    }
  } else if (!isWhitespace(currentChar)) {
    while (
      i < chars.length &&
      !isWordCharStrict(chars[i]) &&
      !isWhitespace(chars[i])
    ) {
      i++;
    }
  }

  // Skip whitespace
  while (i < chars.length && isWhitespace(chars[i])) {
    i++;
  }

  return i < chars.length ? i : null;
};

// Find previous word start within a line
export const findPrevWordStartInLine = (
  line: string,
  col: number,
): number | null => {
  const chars = toCodePoints(line);
  let i = col;

  if (i <= 0) return null;

  i--;

  // Skip whitespace moving backwards
  while (i >= 0 && isWhitespace(chars[i])) {
    i--;
  }

  if (i < 0) return null;

  if (isWordCharStrict(chars[i])) {
    // We're in a word, move to its beginning
    while (i >= 0 && isWordCharStrict(chars[i])) {
      // Check for script boundary - if previous character is from different script, stop here
      if (
        i - 1 >= 0 &&
        isWordCharStrict(chars[i - 1]) &&
        isDifferentScript(chars[i], chars[i - 1])
      ) {
        return i; // Return current position at script boundary
      }
      i--;
    }
    return i + 1;
  } else {
    // We're in punctuation, move to its beginning
    while (i >= 0 && !isWordCharStrict(chars[i]) && !isWhitespace(chars[i])) {
      i--;
    }
    return i + 1;
  }
};

// Find word end within a line
export const findWordEndInLine = (line: string, col: number): number | null => {
  const chars = toCodePoints(line);
  let i = col;

  // If we're already at the end of a word (including punctuation sequences), advance to next word
  // This includes both regular word endings and script boundaries
  let nextBaseCharIdx = i + 1;
  while (
    nextBaseCharIdx < chars.length &&
    isCombiningMark(chars[nextBaseCharIdx])
  ) {
    nextBaseCharIdx++;
  }

  const atEndOfWordChar =
    i < chars.length &&
    isWordCharWithCombining(chars[i]) &&
    (nextBaseCharIdx >= chars.length ||
      !isWordCharStrict(chars[nextBaseCharIdx]) ||
      (isWordCharStrict(chars[i]) &&
        isDifferentScript(chars[i], chars[nextBaseCharIdx])));

  const atEndOfPunctuation =
    i < chars.length &&
    !isWordCharWithCombining(chars[i]) &&
    !isWhitespace(chars[i]) &&
    (i + 1 >= chars.length ||
      isWhitespace(chars[i + 1]) ||
      isWordCharWithCombining(chars[i + 1]));

  if (atEndOfWordChar || atEndOfPunctuation) {
    // We're at the end of a word or punctuation sequence, move forward to find next word
    i++;
    // Skip any combining marks that belong to the word we just finished
    while (i < chars.length && isCombiningMark(chars[i])) {
      i++;
    }
    // Skip whitespace to find next word or punctuation
    while (i < chars.length && isWhitespace(chars[i])) {
      i++;
    }
  }

  // If we're not on a word character, find the next word or punctuation sequence
  if (i < chars.length && !isWordCharWithCombining(chars[i])) {
    // Skip whitespace to find next word or punctuation
    while (i < chars.length && isWhitespace(chars[i])) {
      i++;
    }
  }

  // Move to end of current word (including combining marks, but stop at script boundaries)
  let foundWord = false;
  let lastBaseCharPos = -1;

  if (i < chars.length && isWordCharWithCombining(chars[i])) {
    // Handle word characters
    while (i < chars.length && isWordCharWithCombining(chars[i])) {
      foundWord = true;

      // Track the position of the last base character (not combining mark)
      if (isWordCharStrict(chars[i])) {
        lastBaseCharPos = i;
      }

      // Check if next character is from a different script (word boundary)
      if (
        i + 1 < chars.length &&
        isWordCharStrict(chars[i + 1]) &&
        isDifferentScript(chars[i], chars[i + 1])
      ) {
        i++; // Include current character
        if (isWordCharStrict(chars[i - 1])) {
          lastBaseCharPos = i - 1;
        }
        break; // Stop at script boundary
      }

      i++;
    }
  } else if (i < chars.length && !isWhitespace(chars[i])) {
    // Handle punctuation sequences (like ████)
    while (
      i < chars.length &&
      !isWordCharStrict(chars[i]) &&
      !isWhitespace(chars[i])
    ) {
      foundWord = true;
      lastBaseCharPos = i;
      i++;
    }
  }

  // Only return a position if we actually found a word
  // Return the position of the last base character, not combining marks
  if (foundWord && lastBaseCharPos >= col) {
    return lastBaseCharPos;
  }

  return null;
};

// Find next big word start within a line (W)
export const findNextBigWordStartInLine = (
  line: string,
  col: number,
): number | null => {
  const chars = toCodePoints(line);
  let i = col;

  if (i >= chars.length) return null;

  // If currently on non-whitespace, skip it
  if (!isWhitespace(chars[i])) {
    while (i < chars.length && !isWhitespace(chars[i])) {
      i++;
    }
  }

  // Skip whitespace
  while (i < chars.length && isWhitespace(chars[i])) {
    i++;
  }

  return i < chars.length ? i : null;
};

// Find previous big word start within a line (B)
export const findPrevBigWordStartInLine = (
  line: string,
  col: number,
): number | null => {
  const chars = toCodePoints(line);
  let i = col;

  if (i <= 0) return null;

  i--;

  // Skip whitespace moving backwards
  while (i >= 0 && isWhitespace(chars[i])) {
    i--;
  }

  if (i < 0) return null;

  // We're in a big word, move to its beginning
  while (i >= 0 && !isWhitespace(chars[i])) {
    i--;
  }
  return i + 1;
};

// Find big word end within a line (E)
export const findBigWordEndInLine = (
  line: string,
  col: number,
): number | null => {
  const chars = toCodePoints(line);
  let i = col;

  // If we're already at the end of a big word, advance to next
  const atEndOfBigWord =
    i < chars.length &&
    !isWhitespace(chars[i]) &&
    (i + 1 >= chars.length || isWhitespace(chars[i + 1]));

  if (atEndOfBigWord) {
    i++;
  }

  // Skip whitespace
  while (i < chars.length && isWhitespace(chars[i])) {
    i++;
  }

  // Move to end of current big word
  if (i < chars.length && !isWhitespace(chars[i])) {
    while (i < chars.length && !isWhitespace(chars[i])) {
      i++;
    }
    return i - 1;
  }

  return null;
};

// Initialize segmenter for word boundary detection
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function findPrevWordBoundary(line: string, cursorCol: number): number {
  const codePoints = toCodePoints(line);
  // Convert cursorCol (CP index) to string index
  const prefix = codePoints.slice(0, cursorCol).join('');
  const cursorIdx = prefix.length;

  let targetIdx = 0;

  for (const seg of segmenter.segment(line)) {
    // We want the last word start strictly before the cursor.
    // If we've reached or passed the cursor, we stop.
    if (seg.index >= cursorIdx) break;

    if (seg.isWordLike) {
      targetIdx = seg.index;
    }
  }

  return toCodePoints(line.slice(0, targetIdx)).length;
}

function findNextWordBoundary(line: string, cursorCol: number): number {
  const codePoints = toCodePoints(line);
  const prefix = codePoints.slice(0, cursorCol).join('');
  const cursorIdx = prefix.length;

  let targetIdx = line.length;

  for (const seg of segmenter.segment(line)) {
    const segEnd = seg.index + seg.segment.length;

    if (segEnd > cursorIdx) {
      if (seg.isWordLike) {
        targetIdx = segEnd;
        break;
      }
    }
  }

  return toCodePoints(line.slice(0, targetIdx)).length;
}

// Find next word across lines
export const findNextWordAcrossLines = (
  lines: string[],
  cursorRow: number,
  cursorCol: number,
  searchForWordStart: boolean,
): { row: number; col: number } | null => {
  // First try current line
  const currentLine = lines[cursorRow] || '';
  const colInCurrentLine = searchForWordStart
    ? findNextWordStartInLine(currentLine, cursorCol)
    : findWordEndInLine(currentLine, cursorCol);

  if (colInCurrentLine !== null) {
    return { row: cursorRow, col: colInCurrentLine };
  }

  let firstEmptyRow: number | null = null;

  // Search subsequent lines
  for (let row = cursorRow + 1; row < lines.length; row++) {
    const line = lines[row] || '';
    const chars = toCodePoints(line);

    // For empty lines, if we haven't found any words yet, remember the first empty line
    if (chars.length === 0) {
      if (firstEmptyRow === null) {
        firstEmptyRow = row;
      }
      continue;
    }

    // Find first non-whitespace
    let firstNonWhitespace = 0;
    while (
      firstNonWhitespace < chars.length &&
      isWhitespace(chars[firstNonWhitespace])
    ) {
      firstNonWhitespace++;
    }

    if (firstNonWhitespace < chars.length) {
      if (searchForWordStart) {
        return { row, col: firstNonWhitespace };
      } else {
        // For word end, find the end of the first word
        const endCol = findWordEndInLine(line, firstNonWhitespace);
        if (endCol !== null) {
          return { row, col: endCol };
        }
      }
    }
  }

  // If no words in later lines, return the first empty line we found
  if (firstEmptyRow !== null) {
    return { row: firstEmptyRow, col: 0 };
  }

  return null;
};

// Find previous word across lines
export const findPrevWordAcrossLines = (
  lines: string[],
  cursorRow: number,
  cursorCol: number,
): { row: number; col: number } | null => {
  // First try current line
  const currentLine = lines[cursorRow] || '';
  const colInCurrentLine = findPrevWordStartInLine(currentLine, cursorCol);

  if (colInCurrentLine !== null) {
    return { row: cursorRow, col: colInCurrentLine };
  }

  // Search previous lines
  for (let row = cursorRow - 1; row >= 0; row--) {
    const line = lines[row] || '';
    const chars = toCodePoints(line);

    if (chars.length === 0) continue;

    // Find last word start
    let lastWordStart = chars.length;
    while (lastWordStart > 0 && isWhitespace(chars[lastWordStart - 1])) {
      lastWordStart--;
    }

    if (lastWordStart > 0) {
      // Find start of this word
      const wordStart = findPrevWordStartInLine(line, lastWordStart);
      if (wordStart !== null) {
        return { row, col: wordStart };
      }
    }
  }

  return null;
};

// Find next big word across lines
export const findNextBigWordAcrossLines = (
  lines: string[],
  cursorRow: number,
  cursorCol: number,
  searchForWordStart: boolean,
): { row: number; col: number } | null => {
  // First try current line
  const currentLine = lines[cursorRow] || '';
  const colInCurrentLine = searchForWordStart
    ? findNextBigWordStartInLine(currentLine, cursorCol)
    : findBigWordEndInLine(currentLine, cursorCol);

  if (colInCurrentLine !== null) {
    return { row: cursorRow, col: colInCurrentLine };
  }

  let firstEmptyRow: number | null = null;

  // Search subsequent lines
  for (let row = cursorRow + 1; row < lines.length; row++) {
    const line = lines[row] || '';
    const chars = toCodePoints(line);

    // For empty lines, if we haven't found any words yet, remember the first empty line
    if (chars.length === 0) {
      if (firstEmptyRow === null) {
        firstEmptyRow = row;
      }
      continue;
    }

    // Find first non-whitespace
    let firstNonWhitespace = 0;
    while (
      firstNonWhitespace < chars.length &&
      isWhitespace(chars[firstNonWhitespace])
    ) {
      firstNonWhitespace++;
    }

    if (firstNonWhitespace < chars.length) {
      // Found a non-whitespace character (start of a big word)
      if (searchForWordStart) {
        return { row, col: firstNonWhitespace };
      } else {
        const endCol = findBigWordEndInLine(line, firstNonWhitespace);
        if (endCol !== null) {
          return { row, col: endCol };
        }
      }
    }
  }

  // If no words in later lines, return the first empty line we found
  if (firstEmptyRow !== null) {
    return { row: firstEmptyRow, col: 0 };
  }

  return null;
};

// Find previous big word across lines
export const findPrevBigWordAcrossLines = (
  lines: string[],
  cursorRow: number,
  cursorCol: number,
): { row: number; col: number } | null => {
  // First try current line
  const currentLine = lines[cursorRow] || '';
  const colInCurrentLine = findPrevBigWordStartInLine(currentLine, cursorCol);

  if (colInCurrentLine !== null) {
    return { row: cursorRow, col: colInCurrentLine };
  }

  // Search previous lines
  for (let row = cursorRow - 1; row >= 0; row--) {
    const line = lines[row] || '';
    const chars = toCodePoints(line);

    if (chars.length === 0) continue;

    // Find last big word start
    let lastWordStart = chars.length;
    while (lastWordStart > 0 && isWhitespace(chars[lastWordStart - 1])) {
      lastWordStart--;
    }

    if (lastWordStart > 0) {
      const wordStart = findPrevBigWordStartInLine(line, lastWordStart);
      if (wordStart !== null) {
        return { row, col: wordStart };
      }
    }
  }

  return null;
};

// Helper functions for vim line operations
export const getPositionFromOffsets = (
  startOffset: number,
  endOffset: number,
  lines: string[],
) => {
  let offset = 0;
  let startRow = 0;
  let startCol = 0;
  let endRow = 0;
  let endCol = 0;

  // Find start position
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1; // +1 for newline
    if (offset + lineLength > startOffset) {
      startRow = i;
      startCol = startOffset - offset;
      break;
    }
    offset += lineLength;
  }

  // Find end position
  offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + (i < lines.length - 1 ? 1 : 0); // +1 for newline except last line
    if (offset + lineLength >= endOffset) {
      endRow = i;
      endCol = endOffset - offset;
      break;
    }
    offset += lineLength;
  }

  return { startRow, startCol, endRow, endCol };
};

export const getLineRangeOffsets = (
  startRow: number,
  lineCount: number,
  lines: string[],
) => {
  let startOffset = 0;

  // Calculate start offset
  for (let i = 0; i < startRow; i++) {
    startOffset += lines[i].length + 1; // +1 for newline
  }

  // Calculate end offset
  let endOffset = startOffset;
  for (let i = 0; i < lineCount; i++) {
    const lineIndex = startRow + i;
    if (lineIndex < lines.length) {
      endOffset += lines[lineIndex].length;
      if (lineIndex < lines.length - 1) {
        endOffset += 1; // +1 for newline
      }
    }
  }

  return { startOffset, endOffset };
};

export const replaceRangeInternal = (
  state: TextBufferState,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  text: string,
): TextBufferState => {
  const currentLine = (row: number) => state.lines[row] || '';
  const currentLineLen = (row: number) => cpLen(currentLine(row));
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  if (
    startRow > endRow ||
    (startRow === endRow && startCol > endCol) ||
    startRow < 0 ||
    startCol < 0 ||
    endRow >= state.lines.length ||
    (endRow < state.lines.length && endCol > currentLineLen(endRow))
  ) {
    return state; // Invalid range
  }

  const newLines = [...state.lines];

  const sCol = clamp(startCol, 0, currentLineLen(startRow));
  const eCol = clamp(endCol, 0, currentLineLen(endRow));

  const prefix = cpSlice(currentLine(startRow), 0, sCol);
  const suffix = cpSlice(currentLine(endRow), eCol);

  const normalisedReplacement = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const replacementParts = normalisedReplacement.split('\n');

  // The combined first line of the new text
  const firstLine = prefix + replacementParts[0];

  if (replacementParts.length === 1) {
    // No newlines in replacement: combine prefix, replacement, and suffix on one line.
    newLines.splice(startRow, endRow - startRow + 1, firstLine + suffix);
  } else {
    // Newlines in replacement: create new lines.
    const lastLine = replacementParts[replacementParts.length - 1] + suffix;
    const middleLines = replacementParts.slice(1, -1);
    newLines.splice(
      startRow,
      endRow - startRow + 1,
      firstLine,
      ...middleLines,
      lastLine,
    );
  }

  const finalCursorRow = startRow + replacementParts.length - 1;
  const finalCursorCol =
    (replacementParts.length > 1 ? 0 : sCol) +
    cpLen(replacementParts[replacementParts.length - 1]);

  return {
    ...state,
    lines: newLines,
    cursorRow: Math.min(Math.max(finalCursorRow, 0), newLines.length - 1),
    cursorCol: Math.max(
      0,
      Math.min(finalCursorCol, cpLen(newLines[finalCursorRow] || '')),
    ),
    preferredCol: null,
  };
};

export interface Viewport {
  height: number;
  width: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/* ────────────────────────────────────────────────────────────────────────── */

interface UseTextBufferProps {
  initialText?: string;
  initialCursorOffset?: number;
  viewport: Viewport; // Viewport dimensions needed for scrolling
  stdin?: NodeJS.ReadStream | null; // For external editor
  setRawMode?: (mode: boolean) => void; // For external editor
  onChange?: (text: string) => void; // Callback for when text changes
  isValidPath: (path: string) => boolean;
  shellModeActive?: boolean; // Whether the text buffer is in shell mode
  inputFilter?: (text: string) => string; // Optional filter for input text
  singleLine?: boolean;
  getPreferredEditor?: () => EditorType | undefined;
}

interface UndoHistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  pastedContent: Record<string, string>;
  expandedPaste: ExpandedPasteInfo | null;
}

function calculateInitialCursorPosition(
  initialLines: string[],
  offset: number,
): [number, number] {
  let remainingChars = offset;
  let row = 0;
  while (row < initialLines.length) {
    const lineLength = cpLen(initialLines[row]);
    // Add 1 for the newline character (except for the last line)
    const totalCharsInLineAndNewline =
      lineLength + (row < initialLines.length - 1 ? 1 : 0);

    if (remainingChars <= lineLength) {
      // Cursor is on this line
      return [row, remainingChars];
    }
    remainingChars -= totalCharsInLineAndNewline;
    row++;
  }
  // Offset is beyond the text, place cursor at the end of the last line
  if (initialLines.length > 0) {
    const lastRow = initialLines.length - 1;
    return [lastRow, cpLen(initialLines[lastRow])];
  }
  return [0, 0]; // Default for empty text
}

export function offsetToLogicalPos(
  text: string,
  offset: number,
): [number, number] {
  let row = 0;
  let col = 0;
  let currentOffset = 0;

  if (offset === 0) return [0, 0];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = cpLen(line);
    const lineLengthWithNewline = lineLength + (i < lines.length - 1 ? 1 : 0);

    if (offset <= currentOffset + lineLength) {
      // Check against lineLength first
      row = i;
      col = offset - currentOffset;
      return [row, col];
    } else if (offset <= currentOffset + lineLengthWithNewline) {
      // Check if offset is the newline itself
      row = i;
      col = lineLength; // Position cursor at the end of the current line content
      // If the offset IS the newline, and it's not the last line, advance to next line, col 0
      if (
        offset === currentOffset + lineLengthWithNewline &&
        i < lines.length - 1
      ) {
        return [i + 1, 0];
      }
      return [row, col]; // Otherwise, it's at the end of the current line content
    }
    currentOffset += lineLengthWithNewline;
  }

  // If offset is beyond the text length, place cursor at the end of the last line
  // or [0,0] if text is empty
  if (lines.length > 0) {
    row = lines.length - 1;
    col = cpLen(lines[row]);
  } else {
    row = 0;
    col = 0;
  }
  return [row, col];
}

/**
 * Converts logical row/col position to absolute text offset
 * Inverse operation of offsetToLogicalPos
 */
export function logicalPosToOffset(
  lines: string[],
  row: number,
  col: number,
): number {
  let offset = 0;

  // Clamp row to valid range
  const actualRow = Math.min(row, lines.length - 1);

  // Add lengths of all lines before the target row
  for (let i = 0; i < actualRow; i++) {
    offset += cpLen(lines[i]) + 1; // +1 for newline
  }

  // Add column offset within the target row
  if (actualRow >= 0 && actualRow < lines.length) {
    offset += Math.min(col, cpLen(lines[actualRow]));
  }

  return offset;
}
/**
 * Transformations allow for the CLI to render terse representations of things like file paths
 * (e.g., "@some/path/to/an/image.png" to "[Image image.png]")
 * When the cursor enters a transformed representation, it expands to reveal the logical representation.
 * (e.g., "[Image image.png]" to "@some/path/to/an/image.png")
 */
export interface Transformation {
  logStart: number;
  logEnd: number;
  logicalText: string;
  collapsedText: string;
  type: 'image' | 'paste';
  id?: string; // For paste placeholders
}
export const imagePathRegex =
  /@((?:\\.|[^\s\r\n\\])+?\.(?:png|jpg|jpeg|gif|webp|svg|bmp))\b/gi;

export function getTransformedImagePath(filePath: string): string {
  const raw = filePath;

  // Ignore leading @ when stripping directories, but keep it for simple '@file.png'
  const withoutAt = raw.startsWith('@') ? raw.slice(1) : raw;

  // Unescape the path to handle escaped spaces and other characters
  const unescaped = unescapePath(withoutAt);

  // Find last directory separator, supporting both POSIX and Windows styles
  const lastSepIndex = Math.max(
    unescaped.lastIndexOf('/'),
    unescaped.lastIndexOf('\\'),
  );

  // If we saw a separator, take the segment after it; otherwise fall back to the unescaped string
  const fileName =
    lastSepIndex >= 0 ? unescaped.slice(lastSepIndex + 1) : unescaped;

  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const maxBaseLength = 10;

  const truncatedBase =
    baseName.length > maxBaseLength
      ? `...${baseName.slice(-maxBaseLength)}`
      : baseName;

  return `[Image ${truncatedBase}${extension}]`;
}

const transformationsCache = new LRUCache<string, Transformation[]>(
  LRU_BUFFER_PERF_CACHE_LIMIT,
);

export function calculateTransformationsForLine(
  line: string,
): Transformation[] {
  const cached = transformationsCache.get(line);
  if (cached) {
    return cached;
  }

  const transformations: Transformation[] = [];

  // 1. Detect image paths
  imagePathRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = imagePathRegex.exec(line)) !== null) {
    const logicalText = match[0];
    const logStart = cpLen(line.substring(0, match.index));
    const logEnd = logStart + cpLen(logicalText);

    transformations.push({
      logStart,
      logEnd,
      logicalText,
      collapsedText: getTransformedImagePath(logicalText),
      type: 'image',
    });
  }

  // 2. Detect paste placeholders
  const pasteRegex = new RegExp(PASTED_TEXT_PLACEHOLDER_REGEX.source, 'g');
  while ((match = pasteRegex.exec(line)) !== null) {
    const logicalText = match[0];
    const logStart = cpLen(line.substring(0, match.index));
    const logEnd = logStart + cpLen(logicalText);

    transformations.push({
      logStart,
      logEnd,
      logicalText,
      collapsedText: logicalText,
      type: 'paste',
      id: logicalText,
    });
  }

  // Sort transformations by logStart to maintain consistency
  transformations.sort((a, b) => a.logStart - b.logStart);

  transformationsCache.set(line, transformations);

  return transformations;
}

export function calculateTransformations(lines: string[]): Transformation[][] {
  return lines.map((ln) => calculateTransformationsForLine(ln));
}

export function getTransformUnderCursor(
  row: number,
  col: number,
  spansByLine: Transformation[][],
): Transformation | null {
  const spans = spansByLine[row];
  if (!spans || spans.length === 0) return null;
  for (const span of spans) {
    if (col >= span.logStart && col < span.logEnd) {
      return span;
    }
    if (col < span.logStart) break;
  }
  return null;
}

export interface ExpandedPasteInfo {
  id: string;
  startLine: number;
  lineCount: number;
  prefix: string;
  suffix: string;
}

/**
 * Check if a line index falls within an expanded paste region.
 * Returns the paste placeholder ID if found, null otherwise.
 */
export function getExpandedPasteAtLine(
  lineIndex: number,
  expandedPaste: ExpandedPasteInfo | null,
): string | null {
  if (
    expandedPaste &&
    lineIndex >= expandedPaste.startLine &&
    lineIndex < expandedPaste.startLine + expandedPaste.lineCount
  ) {
    return expandedPaste.id;
  }
  return null;
}

/**
 * Surgery for expanded paste regions when lines are added or removed.
 * Adjusts startLine indices and detaches any region that is partially or fully deleted.
 */
export function shiftExpandedRegions(
  expandedPaste: ExpandedPasteInfo | null,
  changeStartLine: number,
  lineDelta: number,
  changeEndLine?: number, // Inclusive
): {
  newInfo: ExpandedPasteInfo | null;
  isDetached: boolean;
} {
  if (!expandedPaste) return { newInfo: null, isDetached: false };

  const effectiveEndLine = changeEndLine ?? changeStartLine;
  const infoEndLine = expandedPaste.startLine + expandedPaste.lineCount - 1;

  // 1. Check for overlap/intersection with the changed range
  const isOverlapping =
    changeStartLine <= infoEndLine &&
    effectiveEndLine >= expandedPaste.startLine;

  if (isOverlapping) {
    // If the change is a deletion (lineDelta < 0) that touches this region, we detach.
    // If it's an insertion, we only detach if it's a multi-line insertion (lineDelta > 0)
    // that isn't at the very start of the region (which would shift it).
    // Regular character typing (lineDelta === 0) does NOT detach.
    if (
      lineDelta < 0 ||
      (lineDelta > 0 &&
        changeStartLine > expandedPaste.startLine &&
        changeStartLine <= infoEndLine)
    ) {
      return { newInfo: null, isDetached: true };
    }
  }

  // 2. Shift regions that start at or after the change point
  if (expandedPaste.startLine >= changeStartLine) {
    return {
      newInfo: {
        ...expandedPaste,
        startLine: expandedPaste.startLine + lineDelta,
      },
      isDetached: false,
    };
  }

  return { newInfo: expandedPaste, isDetached: false };
}

/**
 * Detach any expanded paste region if the cursor is within it.
 * This converts the expanded content to regular text that can no longer be collapsed.
 * Returns the state unchanged if cursor is not in an expanded region.
 */
export function detachExpandedPaste(state: TextBufferState): TextBufferState {
  const expandedId = getExpandedPasteAtLine(
    state.cursorRow,
    state.expandedPaste,
  );
  if (!expandedId) return state;

  const { [expandedId]: _, ...newPastedContent } = state.pastedContent;
  return {
    ...state,
    expandedPaste: null,
    pastedContent: newPastedContent,
  };
}

/**
 * Represents an atomic placeholder that should be deleted as a unit.
 * Extensible to support future placeholder types.
 */
interface AtomicPlaceholder {
  start: number; // Start position in logical text
  end: number; // End position in logical text
  type: 'paste' | 'image'; // Type for cleanup logic
  id?: string; // For paste placeholders: the pastedContent key
}

/**
 * Find atomic placeholder at cursor for backspace (cursor at end).
 * Checks all placeholder types in priority order.
 */
function findAtomicPlaceholderForBackspace(
  line: string,
  cursorCol: number,
  transformations: Transformation[],
): AtomicPlaceholder | null {
  for (const transform of transformations) {
    if (cursorCol === transform.logEnd) {
      return {
        start: transform.logStart,
        end: transform.logEnd,
        type: transform.type,
        id: transform.id,
      };
    }
  }

  return null;
}

/**
 * Find atomic placeholder at cursor for delete (cursor at start).
 */
function findAtomicPlaceholderForDelete(
  line: string,
  cursorCol: number,
  transformations: Transformation[],
): AtomicPlaceholder | null {
  for (const transform of transformations) {
    if (cursorCol === transform.logStart) {
      return {
        start: transform.logStart,
        end: transform.logEnd,
        type: transform.type,
        id: transform.id,
      };
    }
  }

  return null;
}

export function calculateTransformedLine(
  logLine: string,
  logIndex: number,
  logicalCursor: [number, number],
  transformations: Transformation[],
): { transformedLine: string; transformedToLogMap: number[] } {
  let transformedLine = '';
  const transformedToLogMap: number[] = [];
  let lastLogPos = 0;

  const cursorIsOnThisLine = logIndex === logicalCursor[0];
  const cursorCol = logicalCursor[1];

  for (const transform of transformations) {
    const textBeforeTransformation = cpSlice(
      logLine,
      lastLogPos,
      transform.logStart,
    );
    transformedLine += textBeforeTransformation;
    for (let i = 0; i < cpLen(textBeforeTransformation); i++) {
      transformedToLogMap.push(lastLogPos + i);
    }

    const isExpanded =
      transform.type === 'image' &&
      cursorIsOnThisLine &&
      cursorCol >= transform.logStart &&
      cursorCol <= transform.logEnd;
    const transformedText = isExpanded
      ? transform.logicalText
      : transform.collapsedText;
    transformedLine += transformedText;

    // Map transformed characters back to logical characters
    const transformedLen = cpLen(transformedText);
    if (isExpanded) {
      for (let i = 0; i < transformedLen; i++) {
        transformedToLogMap.push(transform.logStart + i);
      }
    } else {
      // Collapsed: distribute transformed positions monotonically across the raw span.
      // This preserves ordering across wrapped slices so logicalToVisualMap has
      // increasing startColInLogical and visual cursor mapping remains consistent.
      const logicalLength = Math.max(0, transform.logEnd - transform.logStart);
      for (let i = 0; i < transformedLen; i++) {
        // Map the i-th transformed code point into [logStart, logEnd)
        const transformationToLogicalOffset =
          logicalLength === 0
            ? 0
            : Math.floor((i * logicalLength) / transformedLen);
        const transformationToLogicalIndex =
          transform.logStart +
          Math.min(
            transformationToLogicalOffset,
            Math.max(logicalLength - 1, 0),
          );
        transformedToLogMap.push(transformationToLogicalIndex);
      }
    }
    lastLogPos = transform.logEnd;
  }

  // Append text after last transform
  const remainingUntransformedText = cpSlice(logLine, lastLogPos);
  transformedLine += remainingUntransformedText;
  for (let i = 0; i < cpLen(remainingUntransformedText); i++) {
    transformedToLogMap.push(lastLogPos + i);
  }

  // For a cursor at the very end of the transformed line
  transformedToLogMap.push(cpLen(logLine));

  return { transformedLine, transformedToLogMap };
}

export interface VisualLayout {
  visualLines: string[];
  // For each logical line, an array of [visualLineIndex, startColInLogical]
  logicalToVisualMap: Array<Array<[number, number]>>;
  // For each visual line, its [logicalLineIndex, startColInLogical]
  visualToLogicalMap: Array<[number, number]>;
  // Image paths are transformed (e.g., "@some/path/to/an/image.png" to "[Image image.png]")
  // For each logical line, an array that maps each transformedCol to a logicalCol
  transformedToLogicalMaps: number[][];
  // For each visual line, its [startColInTransformed]
  visualToTransformedMap: number[];
}

// Caches for layout calculation
interface LineLayoutResult {
  visualLines: string[];
  logicalToVisualMap: Array<[number, number]>;
  visualToLogicalMap: Array<[number, number]>;
  transformedToLogMap: number[];
  visualToTransformedMap: number[];
}

const lineLayoutCache = new LRUCache<string, LineLayoutResult>(
  LRU_BUFFER_PERF_CACHE_LIMIT,
);

function getLineLayoutCacheKey(
  line: string,
  viewportWidth: number,
  isCursorOnLine: boolean,
  cursorCol: number,
): string {
  // Most lines (99.9% in a large buffer) are not cursor lines.
  // We use a simpler key for them to reduce string allocation overhead.
  if (!isCursorOnLine) {
    return `${viewportWidth}:N:${line}`;
  }
  return `${viewportWidth}:C:${cursorCol}:${line}`;
}

// Calculates the visual wrapping of lines and the mapping between logical and visual coordinates.
// This is an expensive operation and should be memoized.
function calculateLayout(
  logicalLines: string[],
  viewportWidth: number,
  logicalCursor: [number, number],
): VisualLayout {
  const visualLines: string[] = [];
  const logicalToVisualMap: Array<Array<[number, number]>> = [];
  const visualToLogicalMap: Array<[number, number]> = [];
  const transformedToLogicalMaps: number[][] = [];
  const visualToTransformedMap: number[] = [];

  logicalLines.forEach((logLine, logIndex) => {
    logicalToVisualMap[logIndex] = [];

    const isCursorOnLine = logIndex === logicalCursor[0];
    const cacheKey = getLineLayoutCacheKey(
      logLine,
      viewportWidth,
      isCursorOnLine,
      logicalCursor[1],
    );
    const cached = lineLayoutCache.get(cacheKey);

    if (cached) {
      const visualLineOffset = visualLines.length;
      visualLines.push(...cached.visualLines);
      cached.logicalToVisualMap.forEach(([relVisualIdx, logCol]) => {
        logicalToVisualMap[logIndex].push([
          visualLineOffset + relVisualIdx,
          logCol,
        ]);
      });
      cached.visualToLogicalMap.forEach(([, logCol]) => {
        visualToLogicalMap.push([logIndex, logCol]);
      });
      transformedToLogicalMaps[logIndex] = cached.transformedToLogMap;
      visualToTransformedMap.push(...cached.visualToTransformedMap);
      return;
    }

    // Not in cache, calculate
    const transformations = calculateTransformationsForLine(logLine);
    const { transformedLine, transformedToLogMap } = calculateTransformedLine(
      logLine,
      logIndex,
      logicalCursor,
      transformations,
    );

    const lineVisualLines: string[] = [];
    const lineLogicalToVisualMap: Array<[number, number]> = [];
    const lineVisualToLogicalMap: Array<[number, number]> = [];
    const lineVisualToTransformedMap: number[] = [];

    if (transformedLine.length === 0) {
      // Handle empty logical line
      lineLogicalToVisualMap.push([0, 0]);
      lineVisualToLogicalMap.push([logIndex, 0]);
      lineVisualToTransformedMap.push(0);
      lineVisualLines.push('');
    } else {
      // Non-empty logical line
      let currentPosInLogLine = 0; // Tracks position within the current logical line (code point index)
      const codePointsInLogLine = toCodePoints(transformedLine);

      while (currentPosInLogLine < codePointsInLogLine.length) {
        let currentChunk = '';
        let currentChunkVisualWidth = 0;
        let numCodePointsInChunk = 0;
        let lastWordBreakPoint = -1; // Index in codePointsInLogLine for word break
        let numCodePointsAtLastWordBreak = 0;

        // Iterate through code points to build the current visual line (chunk)
        for (let i = currentPosInLogLine; i < codePointsInLogLine.length; i++) {
          const char = codePointsInLogLine[i];
          const charVisualWidth = getCachedStringWidth(char);

          if (currentChunkVisualWidth + charVisualWidth > viewportWidth) {
            // Character would exceed viewport width
            if (
              lastWordBreakPoint !== -1 &&
              numCodePointsAtLastWordBreak > 0 &&
              currentPosInLogLine + numCodePointsAtLastWordBreak < i
            ) {
              // We have a valid word break point to use, and it's not the start of the current segment
              currentChunk = codePointsInLogLine
                .slice(
                  currentPosInLogLine,
                  currentPosInLogLine + numCodePointsAtLastWordBreak,
                )
                .join('');
              numCodePointsInChunk = numCodePointsAtLastWordBreak;
            } else {
              // No word break, or word break is at the start of this potential chunk, or word break leads to empty chunk.
              // Hard break: take characters up to viewportWidth, or just the current char if it alone is too wide.
              if (
                numCodePointsInChunk === 0 &&
                charVisualWidth > viewportWidth
              ) {
                // Single character is wider than viewport, take it anyway
                currentChunk = char;
                numCodePointsInChunk = 1;
              }
            }
            break; // Break from inner loop to finalize this chunk
          }

          currentChunk += char;
          currentChunkVisualWidth += charVisualWidth;
          numCodePointsInChunk++;

          // Check for word break opportunity (space)
          if (char === ' ') {
            lastWordBreakPoint = i; // Store code point index of the space
            // Store the state *before* adding the space, if we decide to break here.
            numCodePointsAtLastWordBreak = numCodePointsInChunk - 1; // Chars *before* the space
          }
        }

        if (
          numCodePointsInChunk === 0 &&
          currentPosInLogLine < codePointsInLogLine.length
        ) {
          const firstChar = codePointsInLogLine[currentPosInLogLine];
          currentChunk = firstChar;
          numCodePointsInChunk = 1;
        }

        const logicalStartCol = transformedToLogMap[currentPosInLogLine] ?? 0;
        lineLogicalToVisualMap.push([lineVisualLines.length, logicalStartCol]);
        lineVisualToLogicalMap.push([logIndex, logicalStartCol]);
        lineVisualToTransformedMap.push(currentPosInLogLine);
        lineVisualLines.push(currentChunk);

        const logicalStartOfThisChunk = currentPosInLogLine;
        currentPosInLogLine += numCodePointsInChunk;

        if (
          logicalStartOfThisChunk + numCodePointsInChunk <
            codePointsInLogLine.length &&
          currentPosInLogLine < codePointsInLogLine.length &&
          codePointsInLogLine[currentPosInLogLine] === ' '
        ) {
          currentPosInLogLine++;
        }
      }
    }

    // Cache the result for this line
    lineLayoutCache.set(cacheKey, {
      visualLines: lineVisualLines,
      logicalToVisualMap: lineLogicalToVisualMap,
      visualToLogicalMap: lineVisualToLogicalMap,
      transformedToLogMap,
      visualToTransformedMap: lineVisualToTransformedMap,
    });

    const visualLineOffset = visualLines.length;
    visualLines.push(...lineVisualLines);
    lineLogicalToVisualMap.forEach(([relVisualIdx, logCol]) => {
      logicalToVisualMap[logIndex].push([
        visualLineOffset + relVisualIdx,
        logCol,
      ]);
    });
    lineVisualToLogicalMap.forEach(([, logCol]) => {
      visualToLogicalMap.push([logIndex, logCol]);
    });
    transformedToLogicalMaps[logIndex] = transformedToLogMap;
    visualToTransformedMap.push(...lineVisualToTransformedMap);
  });

  // If the entire logical text was empty, ensure there's one empty visual line.
  if (
    logicalLines.length === 0 ||
    (logicalLines.length === 1 && logicalLines[0] === '')
  ) {
    if (visualLines.length === 0) {
      visualLines.push('');
      if (!logicalToVisualMap[0]) logicalToVisualMap[0] = [];
      logicalToVisualMap[0].push([0, 0]);
      visualToLogicalMap.push([0, 0]);
      visualToTransformedMap.push(0);
    }
  }

  return {
    visualLines,
    logicalToVisualMap,
    visualToLogicalMap,
    transformedToLogicalMaps,
    visualToTransformedMap,
  };
}

// Calculates the visual cursor position based on a pre-calculated layout.
// This is a lightweight operation.
function calculateVisualCursorFromLayout(
  layout: VisualLayout,
  logicalCursor: [number, number],
): [number, number] {
  const { logicalToVisualMap, visualLines, transformedToLogicalMaps } = layout;
  const [logicalRow, logicalCol] = logicalCursor;

  const segmentsForLogicalLine = logicalToVisualMap[logicalRow];

  if (!segmentsForLogicalLine || segmentsForLogicalLine.length === 0) {
    // This can happen for an empty document.
    return [0, 0];
  }

  // Find the segment where the logical column fits.
  // The segments are sorted by startColInLogical.
  let targetSegmentIndex = segmentsForLogicalLine.findIndex(
    ([, startColInLogical], index) => {
      const nextStartColInLogical =
        index + 1 < segmentsForLogicalLine.length
          ? segmentsForLogicalLine[index + 1][1]
          : Infinity;
      return (
        logicalCol >= startColInLogical && logicalCol < nextStartColInLogical
      );
    },
  );

  // If not found, it means the cursor is at the end of the logical line.
  if (targetSegmentIndex === -1) {
    if (logicalCol === 0) {
      targetSegmentIndex = 0;
    } else {
      targetSegmentIndex = segmentsForLogicalLine.length - 1;
    }
  }

  const [visualRow, startColInLogical] =
    segmentsForLogicalLine[targetSegmentIndex];

  // Find the coordinates in transformed space in order to conver to visual
  const transformedToLogicalMap = transformedToLogicalMaps[logicalRow] ?? [];
  let transformedCol = 0;
  for (let i = 0; i < transformedToLogicalMap.length; i++) {
    if (transformedToLogicalMap[i] > logicalCol) {
      transformedCol = Math.max(0, i - 1);
      break;
    }
    if (i === transformedToLogicalMap.length - 1) {
      transformedCol = transformedToLogicalMap.length - 1;
    }
  }
  let startColInTransformed = 0;
  while (
    startColInTransformed < transformedToLogicalMap.length &&
    transformedToLogicalMap[startColInTransformed] < startColInLogical
  ) {
    startColInTransformed++;
  }
  const clampedTransformedCol = Math.min(
    transformedCol,
    Math.max(0, transformedToLogicalMap.length - 1),
  );
  const visualCol = clampedTransformedCol - startColInTransformed;
  const clampedVisualCol = Math.min(
    Math.max(visualCol, 0),
    cpLen(visualLines[visualRow] ?? ''),
  );
  return [visualRow, clampedVisualCol];
}

// --- Start of reducer logic ---

export interface TextBufferState {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  transformationsByLine: Transformation[][];
  preferredCol: number | null; // This is the logical character offset in the visual line
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  clipboard: string | null;
  selectionAnchor: [number, number] | null;
  viewportWidth: number;
  viewportHeight: number;
  visualLayout: VisualLayout;
  pastedContent: Record<string, string>;
  expandedPaste: ExpandedPasteInfo | null;
}

const historyLimit = 100;

export const pushUndo = (currentState: TextBufferState): TextBufferState => {
  const snapshot: UndoHistoryEntry = {
    lines: [...currentState.lines],
    cursorRow: currentState.cursorRow,
    cursorCol: currentState.cursorCol,
    pastedContent: { ...currentState.pastedContent },
    expandedPaste: currentState.expandedPaste
      ? { ...currentState.expandedPaste }
      : null,
  };
  const newStack = [...currentState.undoStack, snapshot];
  if (newStack.length > historyLimit) {
    newStack.shift();
  }
  return { ...currentState, undoStack: newStack, redoStack: [] };
};

function generatePastedTextId(
  content: string,
  lineCount: number,
  pastedContent: Record<string, string>,
): string {
  const base =
    lineCount > LARGE_PASTE_LINE_THRESHOLD
      ? `[Pasted Text: ${lineCount} lines]`
      : `[Pasted Text: ${content.length} chars]`;

  let id = base;
  let suffix = 2;
  while (pastedContent[id]) {
    id = base.replace(']', ` #${suffix}]`);
    suffix++;
  }
  return id;
}

export type TextBufferAction =
  | { type: 'insert'; payload: string; isPaste?: boolean }
  | {
      type: 'set_text';
      payload: string;
      pushToUndo?: boolean;
      cursorPosition?: 'start' | 'end' | number;
    }
  | { type: 'add_pasted_content'; payload: { id: string; text: string } }
  | { type: 'backspace' }
  | {
      type: 'move';
      payload: {
        dir: Direction;
      };
    }
  | {
      type: 'set_cursor';
      payload: {
        cursorRow: number;
        cursorCol: number;
        preferredCol: number | null;
      };
    }
  | { type: 'delete' }
  | { type: 'delete_word_left' }
  | { type: 'delete_word_right' }
  | { type: 'kill_line_right' }
  | { type: 'kill_line_left' }
  | { type: 'undo' }
  | { type: 'redo' }
  | {
      type: 'replace_range';
      payload: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
        text: string;
      };
    }
  | { type: 'move_to_offset'; payload: { offset: number } }
  | { type: 'create_undo_snapshot' }
  | { type: 'set_viewport'; payload: { width: number; height: number } }
  | { type: 'vim_delete_word_forward'; payload: { count: number } }
  | { type: 'vim_delete_word_backward'; payload: { count: number } }
  | { type: 'vim_delete_word_end'; payload: { count: number } }
  | { type: 'vim_delete_big_word_forward'; payload: { count: number } }
  | { type: 'vim_delete_big_word_backward'; payload: { count: number } }
  | { type: 'vim_delete_big_word_end'; payload: { count: number } }
  | { type: 'vim_change_word_forward'; payload: { count: number } }
  | { type: 'vim_change_word_backward'; payload: { count: number } }
  | { type: 'vim_change_word_end'; payload: { count: number } }
  | { type: 'vim_change_big_word_forward'; payload: { count: number } }
  | { type: 'vim_change_big_word_backward'; payload: { count: number } }
  | { type: 'vim_change_big_word_end'; payload: { count: number } }
  | { type: 'vim_delete_line'; payload: { count: number } }
  | { type: 'vim_change_line'; payload: { count: number } }
  | { type: 'vim_delete_to_end_of_line' }
  | { type: 'vim_change_to_end_of_line' }
  | {
      type: 'vim_change_movement';
      payload: { movement: 'h' | 'j' | 'k' | 'l'; count: number };
    }
  // New vim actions for stateless command handling
  | { type: 'vim_move_left'; payload: { count: number } }
  | { type: 'vim_move_right'; payload: { count: number } }
  | { type: 'vim_move_up'; payload: { count: number } }
  | { type: 'vim_move_down'; payload: { count: number } }
  | { type: 'vim_move_word_forward'; payload: { count: number } }
  | { type: 'vim_move_word_backward'; payload: { count: number } }
  | { type: 'vim_move_word_end'; payload: { count: number } }
  | { type: 'vim_move_big_word_forward'; payload: { count: number } }
  | { type: 'vim_move_big_word_backward'; payload: { count: number } }
  | { type: 'vim_move_big_word_end'; payload: { count: number } }
  | { type: 'vim_delete_char'; payload: { count: number } }
  | { type: 'vim_insert_at_cursor' }
  | { type: 'vim_append_at_cursor' }
  | { type: 'vim_open_line_below' }
  | { type: 'vim_open_line_above' }
  | { type: 'vim_append_at_line_end' }
  | { type: 'vim_insert_at_line_start' }
  | { type: 'vim_move_to_line_start' }
  | { type: 'vim_move_to_line_end' }
  | { type: 'vim_move_to_first_nonwhitespace' }
  | { type: 'vim_move_to_first_line' }
  | { type: 'vim_move_to_last_line' }
  | { type: 'vim_move_to_line'; payload: { lineNumber: number } }
  | { type: 'vim_escape_insert_mode' }
  | {
      type: 'toggle_paste_expansion';
      payload: { id: string; row: number; col: number };
    };

export interface TextBufferOptions {
  inputFilter?: (text: string) => string;
  singleLine?: boolean;
}

function textBufferReducerLogic(
  state: TextBufferState,
  action: TextBufferAction,
  options: TextBufferOptions = {},
): TextBufferState {
  const pushUndoLocal = pushUndo;

  const currentLine = (r: number): string => state.lines[r] ?? '';
  const currentLineLen = (r: number): number => cpLen(currentLine(r));

  switch (action.type) {
    case 'set_text': {
      let nextState = state;
      if (action.pushToUndo !== false) {
        nextState = pushUndoLocal(state);
      }
      const newContentLines = action.payload
        .replace(/\r\n?/g, '\n')
        .split('\n');
      const lines = newContentLines.length === 0 ? [''] : newContentLines;

      let newCursorRow: number;
      let newCursorCol: number;

      if (typeof action.cursorPosition === 'number') {
        [newCursorRow, newCursorCol] = offsetToLogicalPos(
          action.payload,
          action.cursorPosition,
        );
      } else if (action.cursorPosition === 'start') {
        newCursorRow = 0;
        newCursorCol = 0;
      } else {
        // Default to 'end'
        newCursorRow = lines.length - 1;
        newCursorCol = cpLen(lines[newCursorRow] ?? '');
      }

      return {
        ...nextState,
        lines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
        pastedContent: action.payload === '' ? {} : nextState.pastedContent,
      };
    }

    case 'insert': {
      const nextState = detachExpandedPaste(pushUndoLocal(state));
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      let payload = action.payload;
      let newPastedContent = nextState.pastedContent;

      if (action.isPaste) {
        // Normalize line endings for pastes
        payload = payload.replace(/\r\n|\r/g, '\n');
        const lineCount = payload.split('\n').length;
        if (
          lineCount > LARGE_PASTE_LINE_THRESHOLD ||
          payload.length > LARGE_PASTE_CHAR_THRESHOLD
        ) {
          const id = generatePastedTextId(payload, lineCount, newPastedContent);
          newPastedContent = {
            ...newPastedContent,
            [id]: payload,
          };
          payload = id;
        }
      }

      if (options.singleLine) {
        payload = payload.replace(/[\r\n]/g, '');
      }
      if (options.inputFilter) {
        payload = options.inputFilter(payload);
      }

      if (payload.length === 0) {
        return state;
      }

      const str = stripUnsafeCharacters(
        payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      );
      const parts = str.split('\n');
      const lineContent = currentLine(newCursorRow);
      const before = cpSlice(lineContent, 0, newCursorCol);
      const after = cpSlice(lineContent, newCursorCol);

      let lineDelta = 0;
      if (parts.length > 1) {
        newLines[newCursorRow] = before + parts[0];
        const remainingParts = parts.slice(1);
        const lastPartOriginal = remainingParts.pop() ?? '';
        newLines.splice(newCursorRow + 1, 0, ...remainingParts);
        newLines.splice(
          newCursorRow + parts.length - 1,
          0,
          lastPartOriginal + after,
        );
        lineDelta = parts.length - 1;
        newCursorRow = newCursorRow + parts.length - 1;
        newCursorCol = cpLen(lastPartOriginal);
      } else {
        newLines[newCursorRow] = before + parts[0] + after;
        newCursorCol = cpLen(before) + cpLen(parts[0]);
      }

      const { newInfo: newExpandedPaste, isDetached } = shiftExpandedRegions(
        nextState.expandedPaste,
        nextState.cursorRow,
        lineDelta,
      );

      if (isDetached && newExpandedPaste === null && nextState.expandedPaste) {
        delete newPastedContent[nextState.expandedPaste.id];
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
        pastedContent: newPastedContent,
        expandedPaste: newExpandedPaste,
      };
    }

    case 'add_pasted_content': {
      const { id, text } = action.payload;
      return {
        ...state,
        pastedContent: {
          ...state.pastedContent,
          [id]: text,
        },
      };
    }

    case 'backspace': {
      const stateWithUndo = pushUndoLocal(state);
      const currentState = detachExpandedPaste(stateWithUndo);
      const { cursorRow, cursorCol, lines, transformationsByLine } =
        currentState;

      // Early return if at start of buffer
      if (cursorCol === 0 && cursorRow === 0) return currentState;

      // Check if cursor is at end of an atomic placeholder
      const transformations = transformationsByLine[cursorRow] ?? [];
      const placeholder = findAtomicPlaceholderForBackspace(
        lines[cursorRow],
        cursorCol,
        transformations,
      );

      if (placeholder) {
        const nextState = currentState;
        const newLines = [...nextState.lines];
        newLines[cursorRow] =
          cpSlice(newLines[cursorRow], 0, placeholder.start) +
          cpSlice(newLines[cursorRow], placeholder.end);

        // Recalculate transformations for the modified line
        const newTransformations = [...nextState.transformationsByLine];
        newTransformations[cursorRow] = calculateTransformationsForLine(
          newLines[cursorRow],
        );

        // Clean up pastedContent if this was a paste placeholder
        let newPastedContent = nextState.pastedContent;
        if (placeholder.type === 'paste' && placeholder.id) {
          const { [placeholder.id]: _, ...remaining } = nextState.pastedContent;
          newPastedContent = remaining;
        }

        return {
          ...nextState,
          lines: newLines,
          cursorCol: placeholder.start,
          preferredCol: null,
          transformationsByLine: newTransformations,
          pastedContent: newPastedContent,
        };
      }

      // Standard backspace logic
      const nextState = currentState;
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      let lineDelta = 0;
      if (newCursorCol > 0) {
        const lineContent = currentLine(newCursorRow);
        newLines[newCursorRow] =
          cpSlice(lineContent, 0, newCursorCol - 1) +
          cpSlice(lineContent, newCursorCol);
        newCursorCol--;
      } else if (newCursorRow > 0) {
        const prevLineContent = currentLine(newCursorRow - 1);
        const currentLineContentVal = currentLine(newCursorRow);
        const newCol = cpLen(prevLineContent);
        newLines[newCursorRow - 1] = prevLineContent + currentLineContentVal;
        newLines.splice(newCursorRow, 1);
        lineDelta = -1;
        newCursorRow--;
        newCursorCol = newCol;
      }

      const { newInfo: newExpandedPaste, isDetached } = shiftExpandedRegions(
        nextState.expandedPaste,
        nextState.cursorRow + lineDelta, // shift based on the line that was removed
        lineDelta,
        nextState.cursorRow,
      );

      const newPastedContent = { ...nextState.pastedContent };
      if (isDetached && nextState.expandedPaste) {
        delete newPastedContent[nextState.expandedPaste.id];
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
        pastedContent: newPastedContent,
        expandedPaste: newExpandedPaste,
      };
    }

    case 'set_viewport': {
      const { width, height } = action.payload;
      if (width === state.viewportWidth && height === state.viewportHeight) {
        return state;
      }
      return {
        ...state,
        viewportWidth: width,
        viewportHeight: height,
      };
    }

    case 'move': {
      const { dir } = action.payload;
      const { cursorRow, cursorCol, lines, visualLayout, preferredCol } = state;

      // Visual movements
      if (
        dir === 'left' ||
        dir === 'right' ||
        dir === 'up' ||
        dir === 'down' ||
        dir === 'home' ||
        dir === 'end'
      ) {
        const visualCursor = calculateVisualCursorFromLayout(visualLayout, [
          cursorRow,
          cursorCol,
        ]);
        const { visualLines, visualToLogicalMap } = visualLayout;

        let newVisualRow = visualCursor[0];
        let newVisualCol = visualCursor[1];
        let newPreferredCol = preferredCol;

        const currentVisLineLen = cpLen(visualLines[newVisualRow] ?? '');

        switch (dir) {
          case 'left':
            newPreferredCol = null;
            if (newVisualCol > 0) {
              newVisualCol--;
            } else if (newVisualRow > 0) {
              newVisualRow--;
              newVisualCol = cpLen(visualLines[newVisualRow] ?? '');
            }
            break;
          case 'right':
            newPreferredCol = null;
            if (newVisualCol < currentVisLineLen) {
              newVisualCol++;
            } else if (newVisualRow < visualLines.length - 1) {
              newVisualRow++;
              newVisualCol = 0;
            }
            break;
          case 'up':
            if (newVisualRow > 0) {
              if (newPreferredCol === null) newPreferredCol = newVisualCol;
              newVisualRow--;
              newVisualCol = clamp(
                newPreferredCol,
                0,
                cpLen(visualLines[newVisualRow] ?? ''),
              );
            }
            break;
          case 'down':
            if (newVisualRow < visualLines.length - 1) {
              if (newPreferredCol === null) newPreferredCol = newVisualCol;
              newVisualRow++;
              newVisualCol = clamp(
                newPreferredCol,
                0,
                cpLen(visualLines[newVisualRow] ?? ''),
              );
            }
            break;
          case 'home':
            newPreferredCol = null;
            newVisualCol = 0;
            break;
          case 'end':
            newPreferredCol = null;
            newVisualCol = currentVisLineLen;
            break;
          default: {
            const exhaustiveCheck: never = dir;
            debugLogger.error(
              `Unknown visual movement direction: ${exhaustiveCheck}`,
            );
            return state;
          }
        }

        if (visualToLogicalMap[newVisualRow]) {
          const [logRow, logicalStartCol] = visualToLogicalMap[newVisualRow];
          const transformedToLogicalMap =
            visualLayout.transformedToLogicalMaps?.[logRow] ?? [];
          let transformedStartCol = 0;
          while (
            transformedStartCol < transformedToLogicalMap.length &&
            transformedToLogicalMap[transformedStartCol] < logicalStartCol
          ) {
            transformedStartCol++;
          }
          const clampedTransformedCol = Math.min(
            transformedStartCol + newVisualCol,
            Math.max(0, transformedToLogicalMap.length - 1),
          );
          const newLogicalCol =
            transformedToLogicalMap[clampedTransformedCol] ??
            cpLen(lines[logRow] ?? '');
          return {
            ...state,
            cursorRow: logRow,
            cursorCol: newLogicalCol,
            preferredCol: newPreferredCol,
          };
        }
        return state;
      }

      // Logical movements
      switch (dir) {
        case 'wordLeft': {
          if (cursorCol === 0 && cursorRow === 0) return state;

          let newCursorRow = cursorRow;
          let newCursorCol = cursorCol;

          if (cursorCol === 0) {
            newCursorRow--;
            newCursorCol = cpLen(lines[newCursorRow] ?? '');
          } else {
            const lineContent = lines[cursorRow];
            newCursorCol = findPrevWordBoundary(lineContent, cursorCol);
          }
          return {
            ...state,
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: null,
          };
        }
        case 'wordRight': {
          const lineContent = lines[cursorRow] ?? '';
          if (
            cursorRow === lines.length - 1 &&
            cursorCol === cpLen(lineContent)
          ) {
            return state;
          }

          let newCursorRow = cursorRow;
          let newCursorCol = cursorCol;
          const lineLen = cpLen(lineContent);

          if (cursorCol >= lineLen) {
            newCursorRow++;
            newCursorCol = 0;
          } else {
            newCursorCol = findNextWordBoundary(lineContent, cursorCol);
          }
          return {
            ...state,
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: null,
          };
        }
        default:
          return state;
      }
    }

    case 'set_cursor': {
      return {
        ...state,
        ...action.payload,
      };
    }

    case 'delete': {
      const stateWithUndo = pushUndoLocal(state);
      const currentState = detachExpandedPaste(stateWithUndo);
      const { cursorRow, cursorCol, lines, transformationsByLine } =
        currentState;

      // Check if cursor is at start of an atomic placeholder
      const transformations = transformationsByLine[cursorRow] ?? [];
      const placeholder = findAtomicPlaceholderForDelete(
        lines[cursorRow],
        cursorCol,
        transformations,
      );

      if (placeholder) {
        const nextState = currentState;
        const newLines = [...nextState.lines];
        newLines[cursorRow] =
          cpSlice(newLines[cursorRow], 0, placeholder.start) +
          cpSlice(newLines[cursorRow], placeholder.end);

        // Recalculate transformations for the modified line
        const newTransformations = [...nextState.transformationsByLine];
        newTransformations[cursorRow] = calculateTransformationsForLine(
          newLines[cursorRow],
        );

        // Clean up pastedContent if this was a paste placeholder
        let newPastedContent = nextState.pastedContent;
        if (placeholder.type === 'paste' && placeholder.id) {
          const { [placeholder.id]: _, ...remaining } = nextState.pastedContent;
          newPastedContent = remaining;
        }

        return {
          ...nextState,
          lines: newLines,
          // cursorCol stays the same
          preferredCol: null,
          transformationsByLine: newTransformations,
          pastedContent: newPastedContent,
        };
      }

      // Standard delete logic
      const lineContent = currentLine(cursorRow);
      let lineDelta = 0;
      const nextState = currentState;
      const newLines = [...nextState.lines];

      if (cursorCol < currentLineLen(cursorRow)) {
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          cpSlice(lineContent, cursorCol + 1);
      } else if (cursorRow < lines.length - 1) {
        const nextLineContent = currentLine(cursorRow + 1);
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        lineDelta = -1;
      } else {
        return currentState;
      }

      const { newInfo: newExpandedPaste, isDetached } = shiftExpandedRegions(
        nextState.expandedPaste,
        nextState.cursorRow,
        lineDelta,
        nextState.cursorRow + (lineDelta < 0 ? 1 : 0),
      );

      const newPastedContent = { ...nextState.pastedContent };
      if (isDetached && nextState.expandedPaste) {
        delete newPastedContent[nextState.expandedPaste.id];
      }

      return {
        ...nextState,
        lines: newLines,
        preferredCol: null,
        pastedContent: newPastedContent,
        expandedPaste: newExpandedPaste,
      };
    }

    case 'delete_word_left': {
      const stateWithUndo = pushUndoLocal(state);
      const currentState = detachExpandedPaste(stateWithUndo);
      const { cursorRow, cursorCol } = currentState;
      if (cursorCol === 0 && cursorRow === 0) return currentState;

      const nextState = currentState;
      const newLines = [...nextState.lines];
      let newCursorRow = cursorRow;
      let newCursorCol = cursorCol;

      if (newCursorCol > 0) {
        const lineContent = currentLine(newCursorRow);
        const prevWordStart = findPrevWordStartInLine(
          lineContent,
          newCursorCol,
        );
        const start = prevWordStart === null ? 0 : prevWordStart;
        newLines[newCursorRow] =
          cpSlice(lineContent, 0, start) + cpSlice(lineContent, newCursorCol);
        newCursorCol = start;
      } else {
        // Act as a backspace
        const prevLineContent = currentLine(cursorRow - 1);
        const currentLineContentVal = currentLine(cursorRow);
        const newCol = cpLen(prevLineContent);
        newLines[cursorRow - 1] = prevLineContent + currentLineContentVal;
        newLines.splice(cursorRow, 1);
        newCursorRow--;
        newCursorCol = newCol;
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
      };
    }

    case 'delete_word_right': {
      const stateWithUndo = pushUndoLocal(state);
      const currentState = detachExpandedPaste(stateWithUndo);
      const { cursorRow, cursorCol, lines } = currentState;
      const lineContent = currentLine(cursorRow);
      const lineLen = cpLen(lineContent);

      if (cursorCol >= lineLen && cursorRow === lines.length - 1) {
        return currentState;
      }

      const nextState = currentState;
      const newLines = [...nextState.lines];

      if (cursorCol >= lineLen) {
        // Act as a delete, joining with the next line
        const nextLineContent = currentLine(cursorRow + 1);
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
      } else {
        const nextWordStart = findNextWordStartInLine(lineContent, cursorCol);
        const end = nextWordStart === null ? lineLen : nextWordStart;
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) + cpSlice(lineContent, end);
      }

      return {
        ...nextState,
        lines: newLines,
        preferredCol: null,
      };
    }

    case 'kill_line_right': {
      const stateWithUndo = pushUndoLocal(state);
      const currentState = detachExpandedPaste(stateWithUndo);
      const { cursorRow, cursorCol, lines } = currentState;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = currentState;
        const newLines = [...nextState.lines];
        newLines[cursorRow] = cpSlice(lineContent, 0, cursorCol);
        return {
          ...nextState,
          lines: newLines,
        };
      } else if (cursorRow < lines.length - 1) {
        // Act as a delete
        const nextState = currentState;
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return {
          ...nextState,
          lines: newLines,
          preferredCol: null,
        };
      }
      return currentState;
    }

    case 'kill_line_left': {
      const stateWithUndo = pushUndoLocal(state);
      const currentState = detachExpandedPaste(stateWithUndo);
      const { cursorRow, cursorCol } = currentState;
      if (cursorCol > 0) {
        const nextState = currentState;
        const lineContent = currentLine(cursorRow);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = cpSlice(lineContent, cursorCol);
        return {
          ...nextState,
          lines: newLines,
          cursorCol: 0,
          preferredCol: null,
        };
      }
      return currentState;
    }

    case 'undo': {
      const stateToRestore = state.undoStack[state.undoStack.length - 1];
      if (!stateToRestore) return state;

      const currentSnapshot: UndoHistoryEntry = {
        lines: [...state.lines],
        cursorRow: state.cursorRow,
        cursorCol: state.cursorCol,
        pastedContent: { ...state.pastedContent },
        expandedPaste: state.expandedPaste ? { ...state.expandedPaste } : null,
      };
      return {
        ...state,
        ...stateToRestore,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, currentSnapshot],
      };
    }

    case 'redo': {
      const stateToRestore = state.redoStack[state.redoStack.length - 1];
      if (!stateToRestore) return state;

      const currentSnapshot: UndoHistoryEntry = {
        lines: [...state.lines],
        cursorRow: state.cursorRow,
        cursorCol: state.cursorCol,
        pastedContent: { ...state.pastedContent },
        expandedPaste: state.expandedPaste ? { ...state.expandedPaste } : null,
      };
      return {
        ...state,
        ...stateToRestore,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, currentSnapshot],
      };
    }

    case 'replace_range': {
      const { startRow, startCol, endRow, endCol, text } = action.payload;
      const nextState = pushUndoLocal(state);
      const newState = replaceRangeInternal(
        nextState,
        startRow,
        startCol,
        endRow,
        endCol,
        text,
      );

      const oldLineCount = endRow - startRow + 1;
      const newLineCount =
        newState.lines.length - (nextState.lines.length - oldLineCount);
      const lineDelta = newLineCount - oldLineCount;

      const { newInfo: newExpandedPaste, isDetached } = shiftExpandedRegions(
        nextState.expandedPaste,
        startRow,
        lineDelta,
        endRow,
      );

      const newPastedContent = { ...newState.pastedContent };
      if (isDetached && nextState.expandedPaste) {
        delete newPastedContent[nextState.expandedPaste.id];
      }

      return {
        ...newState,
        pastedContent: newPastedContent,
        expandedPaste: newExpandedPaste,
      };
    }

    case 'move_to_offset': {
      const { offset } = action.payload;
      const [newRow, newCol] = offsetToLogicalPos(
        state.lines.join('\n'),
        offset,
      );
      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'create_undo_snapshot': {
      return pushUndoLocal(state);
    }

    // Vim-specific operations
    case 'vim_delete_word_forward':
    case 'vim_delete_word_backward':
    case 'vim_delete_word_end':
    case 'vim_delete_big_word_forward':
    case 'vim_delete_big_word_backward':
    case 'vim_delete_big_word_end':
    case 'vim_change_word_forward':
    case 'vim_change_word_backward':
    case 'vim_change_word_end':
    case 'vim_change_big_word_forward':
    case 'vim_change_big_word_backward':
    case 'vim_change_big_word_end':
    case 'vim_delete_line':
    case 'vim_change_line':
    case 'vim_delete_to_end_of_line':
    case 'vim_change_to_end_of_line':
    case 'vim_change_movement':
    case 'vim_move_left':
    case 'vim_move_right':
    case 'vim_move_up':
    case 'vim_move_down':
    case 'vim_move_word_forward':
    case 'vim_move_word_backward':
    case 'vim_move_word_end':
    case 'vim_move_big_word_forward':
    case 'vim_move_big_word_backward':
    case 'vim_move_big_word_end':
    case 'vim_delete_char':
    case 'vim_insert_at_cursor':
    case 'vim_append_at_cursor':
    case 'vim_open_line_below':
    case 'vim_open_line_above':
    case 'vim_append_at_line_end':
    case 'vim_insert_at_line_start':
    case 'vim_move_to_line_start':
    case 'vim_move_to_line_end':
    case 'vim_move_to_first_nonwhitespace':
    case 'vim_move_to_first_line':
    case 'vim_move_to_last_line':
    case 'vim_move_to_line':
    case 'vim_escape_insert_mode':
      return handleVimAction(state, action as VimAction);

    case 'toggle_paste_expansion': {
      const { id, row, col } = action.payload;
      const expandedPaste = state.expandedPaste;

      if (expandedPaste && expandedPaste.id === id) {
        const nextState = pushUndoLocal(state);
        // COLLAPSE: Restore original line with placeholder
        const newLines = [...nextState.lines];
        newLines.splice(
          expandedPaste.startLine,
          expandedPaste.lineCount,
          expandedPaste.prefix + id + expandedPaste.suffix,
        );

        // Move cursor to end of collapsed placeholder
        const newCursorRow = expandedPaste.startLine;
        const newCursorCol = cpLen(expandedPaste.prefix) + cpLen(id);

        return {
          ...nextState,
          lines: newLines,
          cursorRow: newCursorRow,
          cursorCol: newCursorCol,
          preferredCol: null,
          expandedPaste: null,
        };
      } else {
        // EXPAND: Replace placeholder with content

        // Collapse any existing expanded paste first
        let currentState = state;
        let targetRow = row;
        if (state.expandedPaste) {
          const existingInfo = state.expandedPaste;
          const lineDelta = 1 - existingInfo.lineCount;

          if (targetRow !== undefined && targetRow > existingInfo.startLine) {
            // If we collapsed something above our target, our target row shifted up
            targetRow += lineDelta;
          }

          currentState = textBufferReducerLogic(state, {
            type: 'toggle_paste_expansion',
            payload: {
              id: existingInfo.id,
              row: existingInfo.startLine,
              col: 0,
            },
          });
          // Update transformations because they are needed for finding the next placeholder
          currentState.transformationsByLine = calculateTransformations(
            currentState.lines,
          );
        }

        const content = currentState.pastedContent[id];
        if (!content) return currentState;

        // Find line and position containing exactly this placeholder
        let lineIndex = -1;
        let placeholderStart = -1;

        const tryFindOnLine = (idx: number) => {
          const transforms = currentState.transformationsByLine[idx] ?? [];

          // Precise match by col
          let transform = transforms.find(
            (t) =>
              t.type === 'paste' &&
              t.id === id &&
              col >= t.logStart &&
              col <= t.logEnd,
          );

          if (!transform) {
            // Fallback to first match on line
            transform = transforms.find(
              (t) => t.type === 'paste' && t.id === id,
            );
          }

          if (transform) {
            lineIndex = idx;
            placeholderStart = transform.logStart;
            return true;
          }
          return false;
        };

        // Try provided row first for precise targeting
        if (targetRow >= 0 && targetRow < currentState.lines.length) {
          tryFindOnLine(targetRow);
        }

        if (lineIndex === -1) {
          for (let i = 0; i < currentState.lines.length; i++) {
            if (tryFindOnLine(i)) break;
          }
        }

        if (lineIndex === -1) return currentState;

        const nextState = pushUndoLocal(currentState);

        const line = nextState.lines[lineIndex];
        const prefix = cpSlice(line, 0, placeholderStart);
        const suffix = cpSlice(line, placeholderStart + cpLen(id));

        // Split content into lines
        const contentLines = content.split('\n');
        const newLines = [...nextState.lines];

        let expandedLines: string[];
        if (contentLines.length === 1) {
          // Single-line content
          expandedLines = [prefix + contentLines[0] + suffix];
        } else {
          // Multi-line content
          expandedLines = [
            prefix + contentLines[0],
            ...contentLines.slice(1, -1),
            contentLines[contentLines.length - 1] + suffix,
          ];
        }

        newLines.splice(lineIndex, 1, ...expandedLines);

        // Move cursor to end of expanded content (before suffix)
        const newCursorRow = lineIndex + expandedLines.length - 1;
        const lastExpandedLine = expandedLines[expandedLines.length - 1];
        const newCursorCol = cpLen(lastExpandedLine) - cpLen(suffix);

        return {
          ...nextState,
          lines: newLines,
          cursorRow: newCursorRow,
          cursorCol: newCursorCol,
          preferredCol: null,
          expandedPaste: {
            id,
            startLine: lineIndex,
            lineCount: expandedLines.length,
            prefix,
            suffix,
          },
        };
      }
    }

    default: {
      const exhaustiveCheck: never = action;
      debugLogger.error(`Unknown action encountered: ${exhaustiveCheck}`);
      return state;
    }
  }
}

export function textBufferReducer(
  state: TextBufferState,
  action: TextBufferAction,
  options: TextBufferOptions = {},
): TextBufferState {
  const newState = textBufferReducerLogic(state, action, options);

  const newTransformedLines =
    newState.lines !== state.lines
      ? calculateTransformations(newState.lines)
      : state.transformationsByLine;

  const oldTransform = getTransformUnderCursor(
    state.cursorRow,
    state.cursorCol,
    state.transformationsByLine,
  );
  const newTransform = getTransformUnderCursor(
    newState.cursorRow,
    newState.cursorCol,
    newTransformedLines,
  );
  const oldInside = oldTransform !== null;
  const newInside = newTransform !== null;
  const movedBetweenTransforms =
    oldTransform !== newTransform &&
    (oldTransform !== null || newTransform !== null);

  if (
    newState.lines !== state.lines ||
    newState.viewportWidth !== state.viewportWidth ||
    oldInside !== newInside ||
    movedBetweenTransforms
  ) {
    const shouldResetPreferred =
      oldInside !== newInside || movedBetweenTransforms;

    return {
      ...newState,
      preferredCol: shouldResetPreferred ? null : newState.preferredCol,
      visualLayout: calculateLayout(newState.lines, newState.viewportWidth, [
        newState.cursorRow,
        newState.cursorCol,
      ]),
      transformationsByLine: newTransformedLines,
    };
  }

  return newState;
}

// --- End of reducer logic ---

export function useTextBuffer({
  initialText = '',
  initialCursorOffset = 0,
  viewport,
  stdin,
  setRawMode,
  onChange,
  isValidPath,
  shellModeActive = false,
  inputFilter,
  singleLine = false,
  getPreferredEditor,
}: UseTextBufferProps): TextBuffer {
  const initialState = useMemo((): TextBufferState => {
    const lines = initialText.split('\n');
    const [initialCursorRow, initialCursorCol] = calculateInitialCursorPosition(
      lines.length === 0 ? [''] : lines,
      initialCursorOffset,
    );
    const transformationsByLine = calculateTransformations(
      lines.length === 0 ? [''] : lines,
    );
    const visualLayout = calculateLayout(
      lines.length === 0 ? [''] : lines,
      viewport.width,
      [initialCursorRow, initialCursorCol],
    );
    return {
      lines: lines.length === 0 ? [''] : lines,
      cursorRow: initialCursorRow,
      cursorCol: initialCursorCol,
      transformationsByLine,
      preferredCol: null,
      undoStack: [],
      redoStack: [],
      clipboard: null,
      selectionAnchor: null,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      visualLayout,
      pastedContent: {},
      expandedPaste: null,
    };
  }, [initialText, initialCursorOffset, viewport.width, viewport.height]);

  const [state, dispatch] = useReducer(
    (s: TextBufferState, a: TextBufferAction) =>
      textBufferReducer(s, a, { inputFilter, singleLine }),
    initialState,
  );
  const {
    lines,
    cursorRow,
    cursorCol,
    preferredCol,
    selectionAnchor,
    visualLayout,
    transformationsByLine,
    pastedContent,
    expandedPaste,
  } = state;

  const text = useMemo(() => lines.join('\n'), [lines]);

  const visualCursor = useMemo(
    () => calculateVisualCursorFromLayout(visualLayout, [cursorRow, cursorCol]),
    [visualLayout, cursorRow, cursorCol],
  );

  const {
    visualLines,
    visualToLogicalMap,
    transformedToLogicalMaps,
    visualToTransformedMap,
  } = visualLayout;

  const [scrollRowState, setScrollRowState] = useState<number>(0);

  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

  useEffect(() => {
    dispatch({
      type: 'set_viewport',
      payload: { width: viewport.width, height: viewport.height },
    });
  }, [viewport.width, viewport.height]);

  // Update visual scroll (vertical)
  useEffect(() => {
    const { height } = viewport;
    const totalVisualLines = visualLines.length;
    const maxScrollStart = Math.max(0, totalVisualLines - height);
    let newVisualScrollRow = scrollRowState;

    if (visualCursor[0] < scrollRowState) {
      newVisualScrollRow = visualCursor[0];
    } else if (visualCursor[0] >= scrollRowState + height) {
      newVisualScrollRow = visualCursor[0] - height + 1;
    }

    // When the number of visual lines shrinks (e.g., after widening the viewport),
    // ensure scroll never starts beyond the last valid start so we can render a full window.
    newVisualScrollRow = clamp(newVisualScrollRow, 0, maxScrollStart);

    if (newVisualScrollRow !== scrollRowState) {
      setScrollRowState(newVisualScrollRow);
    }
  }, [visualCursor, scrollRowState, viewport, visualLines.length]);

  const insert = useCallback(
    (ch: string, { paste = false }: { paste?: boolean } = {}): void => {
      if (typeof ch !== 'string') {
        return;
      }

      let textToInsert = ch;
      const minLengthToInferAsDragDrop = 3;
      if (
        ch.length >= minLengthToInferAsDragDrop &&
        !shellModeActive &&
        paste
      ) {
        let potentialPath = ch.trim();
        const quoteMatch = potentialPath.match(/^'(.*)'$/);
        if (quoteMatch) {
          potentialPath = quoteMatch[1];
        }

        potentialPath = potentialPath.trim();

        const processed = parsePastedPaths(potentialPath, isValidPath);
        if (processed) {
          textToInsert = processed;
        }
      }

      let currentText = '';
      for (const char of toCodePoints(textToInsert)) {
        if (char.codePointAt(0) === 127) {
          if (currentText.length > 0) {
            dispatch({ type: 'insert', payload: currentText, isPaste: paste });
            currentText = '';
          }
          dispatch({ type: 'backspace' });
        } else {
          currentText += char;
        }
      }
      if (currentText.length > 0) {
        dispatch({ type: 'insert', payload: currentText, isPaste: paste });
      }
    },
    [isValidPath, shellModeActive],
  );

  const newline = useCallback((): void => {
    if (singleLine) {
      return;
    }
    dispatch({ type: 'insert', payload: '\n' });
  }, [singleLine]);

  const backspace = useCallback((): void => {
    dispatch({ type: 'backspace' });
  }, []);

  const del = useCallback((): void => {
    dispatch({ type: 'delete' });
  }, []);

  const move = useCallback(
    (dir: Direction): void => {
      dispatch({ type: 'move', payload: { dir } });
    },
    [dispatch],
  );

  const undo = useCallback((): void => {
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback((): void => {
    dispatch({ type: 'redo' });
  }, []);

  const setText = useCallback(
    (newText: string, cursorPosition?: 'start' | 'end' | number): void => {
      dispatch({ type: 'set_text', payload: newText, cursorPosition });
    },
    [],
  );

  const deleteWordLeft = useCallback((): void => {
    dispatch({ type: 'delete_word_left' });
  }, []);

  const deleteWordRight = useCallback((): void => {
    dispatch({ type: 'delete_word_right' });
  }, []);

  const killLineRight = useCallback((): void => {
    dispatch({ type: 'kill_line_right' });
  }, []);

  const killLineLeft = useCallback((): void => {
    dispatch({ type: 'kill_line_left' });
  }, []);

  // Vim-specific operations
  const vimDeleteWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_word_forward', payload: { count } });
  }, []);

  const vimDeleteWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_word_backward', payload: { count } });
  }, []);

  const vimDeleteWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_word_end', payload: { count } });
  }, []);

  const vimDeleteBigWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_big_word_forward', payload: { count } });
  }, []);

  const vimDeleteBigWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_big_word_backward', payload: { count } });
  }, []);

  const vimDeleteBigWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_big_word_end', payload: { count } });
  }, []);

  const vimChangeWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_word_forward', payload: { count } });
  }, []);

  const vimChangeWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_word_backward', payload: { count } });
  }, []);

  const vimChangeWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_word_end', payload: { count } });
  }, []);

  const vimChangeBigWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_big_word_forward', payload: { count } });
  }, []);

  const vimChangeBigWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_big_word_backward', payload: { count } });
  }, []);

  const vimChangeBigWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_big_word_end', payload: { count } });
  }, []);

  const vimDeleteLine = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_line', payload: { count } });
  }, []);

  const vimChangeLine = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_line', payload: { count } });
  }, []);

  const vimDeleteToEndOfLine = useCallback((): void => {
    dispatch({ type: 'vim_delete_to_end_of_line' });
  }, []);

  const vimChangeToEndOfLine = useCallback((): void => {
    dispatch({ type: 'vim_change_to_end_of_line' });
  }, []);

  const vimChangeMovement = useCallback(
    (movement: 'h' | 'j' | 'k' | 'l', count: number): void => {
      dispatch({ type: 'vim_change_movement', payload: { movement, count } });
    },
    [],
  );

  // New vim navigation and operation methods
  const vimMoveLeft = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_left', payload: { count } });
  }, []);

  const vimMoveRight = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_right', payload: { count } });
  }, []);

  const vimMoveUp = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_up', payload: { count } });
  }, []);

  const vimMoveDown = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_down', payload: { count } });
  }, []);

  const vimMoveWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_word_forward', payload: { count } });
  }, []);

  const vimMoveWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_word_backward', payload: { count } });
  }, []);

  const vimMoveWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_word_end', payload: { count } });
  }, []);

  const vimMoveBigWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_big_word_forward', payload: { count } });
  }, []);

  const vimMoveBigWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_big_word_backward', payload: { count } });
  }, []);

  const vimMoveBigWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_move_big_word_end', payload: { count } });
  }, []);

  const vimDeleteChar = useCallback((count: number): void => {
    dispatch({ type: 'vim_delete_char', payload: { count } });
  }, []);

  const vimInsertAtCursor = useCallback((): void => {
    dispatch({ type: 'vim_insert_at_cursor' });
  }, []);

  const vimAppendAtCursor = useCallback((): void => {
    dispatch({ type: 'vim_append_at_cursor' });
  }, []);

  const vimOpenLineBelow = useCallback((): void => {
    dispatch({ type: 'vim_open_line_below' });
  }, []);

  const vimOpenLineAbove = useCallback((): void => {
    dispatch({ type: 'vim_open_line_above' });
  }, []);

  const vimAppendAtLineEnd = useCallback((): void => {
    dispatch({ type: 'vim_append_at_line_end' });
  }, []);

  const vimInsertAtLineStart = useCallback((): void => {
    dispatch({ type: 'vim_insert_at_line_start' });
  }, []);

  const vimMoveToLineStart = useCallback((): void => {
    dispatch({ type: 'vim_move_to_line_start' });
  }, []);

  const vimMoveToLineEnd = useCallback((): void => {
    dispatch({ type: 'vim_move_to_line_end' });
  }, []);

  const vimMoveToFirstNonWhitespace = useCallback((): void => {
    dispatch({ type: 'vim_move_to_first_nonwhitespace' });
  }, []);

  const vimMoveToFirstLine = useCallback((): void => {
    dispatch({ type: 'vim_move_to_first_line' });
  }, []);

  const vimMoveToLastLine = useCallback((): void => {
    dispatch({ type: 'vim_move_to_last_line' });
  }, []);

  const vimMoveToLine = useCallback((lineNumber: number): void => {
    dispatch({ type: 'vim_move_to_line', payload: { lineNumber } });
  }, []);

  const vimEscapeInsertMode = useCallback((): void => {
    dispatch({ type: 'vim_escape_insert_mode' });
  }, []);

  const openInExternalEditor = useCallback(async (): Promise<void> => {
    const tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'gemini-edit-'));
    const filePath = pathMod.join(tmpDir, 'buffer.txt');
    // Expand paste placeholders so user sees full content in editor
    const expandedText = text.replace(
      PASTED_TEXT_PLACEHOLDER_REGEX,
      (match) => pastedContent[match] || match,
    );
    fs.writeFileSync(filePath, expandedText, 'utf8');

    let command: string | undefined = undefined;
    const args = [filePath];

    const preferredEditorType = getPreferredEditor?.();
    if (!command && preferredEditorType) {
      command = getEditorCommand(preferredEditorType);
      if (isGuiEditor(preferredEditorType)) {
        args.unshift('--wait');
      }
    }

    if (!command) {
      command =
        process.env['VISUAL'] ??
        process.env['EDITOR'] ??
        (process.platform === 'win32' ? 'notepad' : 'vi');
    }

    dispatch({ type: 'create_undo_snapshot' });

    const wasRaw = stdin?.isRaw ?? false;
    try {
      setRawMode?.(false);
      const { status, error } = spawnSync(command, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      if (error) throw error;
      if (typeof status === 'number' && status !== 0)
        throw new Error(`External editor exited with status ${status}`);

      let newText = fs.readFileSync(filePath, 'utf8');
      newText = newText.replace(/\r\n?/g, '\n');

      // Attempt to re-collapse unchanged pasted content back into placeholders
      const sortedPlaceholders = Object.entries(pastedContent).sort(
        (a, b) => b[1].length - a[1].length,
      );
      for (const [id, content] of sortedPlaceholders) {
        if (newText.includes(content)) {
          newText = newText.replace(content, id);
        }
      }

      dispatch({ type: 'set_text', payload: newText, pushToUndo: false });
    } catch (err) {
      coreEvents.emitFeedback(
        'error',
        '[useTextBuffer] external editor error',
        err,
      );
    } finally {
      coreEvents.emit(CoreEvent.ExternalEditorClosed);
      if (wasRaw) setRawMode?.(true);
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
      try {
        fs.rmdirSync(tmpDir);
      } catch {
        /* ignore */
      }
    }
  }, [text, pastedContent, stdin, setRawMode, getPreferredEditor]);

  const handleInput = useCallback(
    (key: Key): boolean => {
      const { sequence: input } = key;

      if (key.name === 'paste') {
        insert(input, { paste: true });
        return true;
      }
      if (keyMatchers[Command.RETURN](key)) {
        if (singleLine) {
          return false;
        }
        newline();
        return true;
      }
      if (keyMatchers[Command.NEWLINE](key)) {
        if (singleLine) {
          return false;
        }
        newline();
        return true;
      }
      if (keyMatchers[Command.MOVE_LEFT](key)) {
        if (cursorRow === 0 && cursorCol === 0) return false;
        move('left');
        return true;
      }
      if (keyMatchers[Command.MOVE_RIGHT](key)) {
        const lastLineIdx = lines.length - 1;
        if (
          cursorRow === lastLineIdx &&
          cursorCol === cpLen(lines[lastLineIdx] ?? '')
        ) {
          return false;
        }
        move('right');
        return true;
      }
      if (keyMatchers[Command.MOVE_UP](key)) {
        if (visualCursor[0] === 0) return false;
        move('up');
        return true;
      }
      if (keyMatchers[Command.MOVE_DOWN](key)) {
        if (visualCursor[0] === visualLines.length - 1) return false;
        move('down');
        return true;
      }
      if (keyMatchers[Command.MOVE_WORD_LEFT](key)) {
        move('wordLeft');
        return true;
      }
      if (keyMatchers[Command.MOVE_WORD_RIGHT](key)) {
        move('wordRight');
        return true;
      }
      if (keyMatchers[Command.HOME](key)) {
        move('home');
        return true;
      }
      if (keyMatchers[Command.END](key)) {
        move('end');
        return true;
      }
      if (keyMatchers[Command.CLEAR_INPUT](key)) {
        if (text.length > 0) {
          setText('');
          return true;
        }
        return false;
      }
      if (keyMatchers[Command.DELETE_WORD_BACKWARD](key)) {
        deleteWordLeft();
        return true;
      }
      if (keyMatchers[Command.DELETE_WORD_FORWARD](key)) {
        deleteWordRight();
        return true;
      }
      if (keyMatchers[Command.DELETE_CHAR_LEFT](key)) {
        backspace();
        return true;
      }
      if (keyMatchers[Command.DELETE_CHAR_RIGHT](key)) {
        const lastLineIdx = lines.length - 1;
        if (
          cursorRow === lastLineIdx &&
          cursorCol === cpLen(lines[lastLineIdx] ?? '')
        ) {
          return false;
        }
        del();
        return true;
      }
      if (keyMatchers[Command.UNDO](key)) {
        undo();
        return true;
      }
      if (keyMatchers[Command.REDO](key)) {
        redo();
        return true;
      }
      if (key.insertable) {
        insert(input, { paste: false });
        return true;
      }
      return false;
    },
    [
      newline,
      move,
      deleteWordLeft,
      deleteWordRight,
      backspace,
      del,
      insert,
      undo,
      redo,
      cursorRow,
      cursorCol,
      lines,
      singleLine,
      setText,
      text,
      visualCursor,
      visualLines,
    ],
  );

  const visualScrollRow = useMemo(() => {
    const totalVisualLines = visualLines.length;
    return Math.min(
      scrollRowState,
      Math.max(0, totalVisualLines - viewport.height),
    );
  }, [visualLines.length, scrollRowState, viewport.height]);

  const renderedVisualLines = useMemo(
    () => visualLines.slice(visualScrollRow, visualScrollRow + viewport.height),
    [visualLines, visualScrollRow, viewport.height],
  );

  const replaceRange = useCallback(
    (
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      text: string,
    ): void => {
      dispatch({
        type: 'replace_range',
        payload: { startRow, startCol, endRow, endCol, text },
      });
    },
    [],
  );

  const replaceRangeByOffset = useCallback(
    (startOffset: number, endOffset: number, replacementText: string): void => {
      const [startRow, startCol] = offsetToLogicalPos(text, startOffset);
      const [endRow, endCol] = offsetToLogicalPos(text, endOffset);
      replaceRange(startRow, startCol, endRow, endCol, replacementText);
    },
    [text, replaceRange],
  );

  const moveToOffset = useCallback((offset: number): void => {
    dispatch({ type: 'move_to_offset', payload: { offset } });
  }, []);

  const moveToVisualPosition = useCallback(
    (visRow: number, visCol: number): void => {
      const {
        visualLines,
        visualToLogicalMap,
        transformedToLogicalMaps,
        visualToTransformedMap,
      } = visualLayout;
      // Clamp visRow to valid range
      const clampedVisRow = Math.max(
        0,
        Math.min(visRow, visualLines.length - 1),
      );
      const visualLine = visualLines[clampedVisRow] || '';

      if (visualToLogicalMap[clampedVisRow]) {
        const [logRow] = visualToLogicalMap[clampedVisRow];
        const transformedToLogicalMap =
          transformedToLogicalMaps?.[logRow] ?? [];

        // Where does this visual line begin within the transformed line?
        const startColInTransformed =
          visualToTransformedMap?.[clampedVisRow] ?? 0;

        // Handle wide characters: convert visual X position to character offset
        const codePoints = toCodePoints(visualLine);
        let currentVisX = 0;
        let charOffset = 0;

        for (const char of codePoints) {
          const charWidth = getCachedStringWidth(char);
          // If the click is within this character
          if (visCol < currentVisX + charWidth) {
            // Check if we clicked the second half of a wide character
            if (charWidth > 1 && visCol >= currentVisX + charWidth / 2) {
              charOffset++;
            }
            break;
          }
          currentVisX += charWidth;
          charOffset++;
        }

        // Clamp charOffset to length
        charOffset = Math.min(charOffset, codePoints.length);

        // Map character offset through transformations to get logical position
        const transformedCol = Math.min(
          startColInTransformed + charOffset,
          Math.max(0, transformedToLogicalMap.length - 1),
        );

        const newCursorRow = logRow;
        const newCursorCol =
          transformedToLogicalMap[transformedCol] ?? cpLen(lines[logRow] ?? '');

        dispatch({
          type: 'set_cursor',
          payload: {
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: charOffset,
          },
        });
      }
    },
    [visualLayout, lines],
  );

  const getLogicalPositionFromVisual = useCallback(
    (visRow: number, visCol: number): { row: number; col: number } | null => {
      const {
        visualLines,
        visualToLogicalMap,
        transformedToLogicalMaps,
        visualToTransformedMap,
      } = visualLayout;

      // Clamp visRow to valid range
      const clampedVisRow = Math.max(
        0,
        Math.min(visRow, visualLines.length - 1),
      );
      const visualLine = visualLines[clampedVisRow] || '';

      if (!visualToLogicalMap[clampedVisRow]) {
        return null;
      }

      const [logRow] = visualToLogicalMap[clampedVisRow];
      const transformedToLogicalMap = transformedToLogicalMaps?.[logRow] ?? [];

      // Where does this visual line begin within the transformed line?
      const startColInTransformed =
        visualToTransformedMap?.[clampedVisRow] ?? 0;

      // Handle wide characters: convert visual X position to character offset
      const codePoints = toCodePoints(visualLine);
      let currentVisX = 0;
      let charOffset = 0;

      for (const char of codePoints) {
        const charWidth = getCachedStringWidth(char);
        if (visCol < currentVisX + charWidth) {
          if (charWidth > 1 && visCol >= currentVisX + charWidth / 2) {
            charOffset++;
          }
          break;
        }
        currentVisX += charWidth;
        charOffset++;
      }

      charOffset = Math.min(charOffset, codePoints.length);

      const transformedCol = Math.min(
        startColInTransformed + charOffset,
        Math.max(0, transformedToLogicalMap.length - 1),
      );

      const row = logRow;
      const col =
        transformedToLogicalMap[transformedCol] ?? cpLen(lines[logRow] ?? '');

      return { row, col };
    },
    [visualLayout, lines],
  );

  const getOffset = useCallback(
    (): number => logicalPosToOffset(lines, cursorRow, cursorCol),
    [lines, cursorRow, cursorCol],
  );

  const togglePasteExpansion = useCallback(
    (id: string, row: number, col: number): void => {
      dispatch({ type: 'toggle_paste_expansion', payload: { id, row, col } });
    },
    [],
  );

  const getExpandedPasteAtLineCallback = useCallback(
    (lineIndex: number): string | null =>
      getExpandedPasteAtLine(lineIndex, expandedPaste),
    [expandedPaste],
  );

  const returnValue: TextBuffer = useMemo(
    () => ({
      lines,
      text,
      cursor: [cursorRow, cursorCol],
      preferredCol,
      selectionAnchor,
      pastedContent,

      allVisualLines: visualLines,
      viewportVisualLines: renderedVisualLines,
      visualCursor,
      visualScrollRow,
      visualToLogicalMap,
      transformedToLogicalMaps,
      visualToTransformedMap,
      transformationsByLine,
      visualLayout,
      setText,
      insert,
      newline,
      backspace,
      del,
      move,
      undo,
      redo,
      replaceRange,
      replaceRangeByOffset,
      moveToOffset,
      getOffset,
      moveToVisualPosition,
      getLogicalPositionFromVisual,
      getExpandedPasteAtLine: getExpandedPasteAtLineCallback,
      togglePasteExpansion,
      expandedPaste,
      deleteWordLeft,
      deleteWordRight,

      killLineRight,
      killLineLeft,
      handleInput,
      openInExternalEditor,
      // Vim-specific operations
      vimDeleteWordForward,
      vimDeleteWordBackward,
      vimDeleteWordEnd,
      vimDeleteBigWordForward,
      vimDeleteBigWordBackward,
      vimDeleteBigWordEnd,
      vimChangeWordForward,
      vimChangeWordBackward,
      vimChangeWordEnd,
      vimChangeBigWordForward,
      vimChangeBigWordBackward,
      vimChangeBigWordEnd,
      vimDeleteLine,
      vimChangeLine,
      vimDeleteToEndOfLine,
      vimChangeToEndOfLine,
      vimChangeMovement,
      vimMoveLeft,
      vimMoveRight,
      vimMoveUp,
      vimMoveDown,
      vimMoveWordForward,
      vimMoveWordBackward,
      vimMoveWordEnd,
      vimMoveBigWordForward,
      vimMoveBigWordBackward,
      vimMoveBigWordEnd,
      vimDeleteChar,
      vimInsertAtCursor,
      vimAppendAtCursor,
      vimOpenLineBelow,
      vimOpenLineAbove,
      vimAppendAtLineEnd,
      vimInsertAtLineStart,
      vimMoveToLineStart,
      vimMoveToLineEnd,
      vimMoveToFirstNonWhitespace,
      vimMoveToFirstLine,
      vimMoveToLastLine,
      vimMoveToLine,
      vimEscapeInsertMode,
    }),
    [
      lines,
      text,
      cursorRow,
      cursorCol,
      preferredCol,
      selectionAnchor,
      pastedContent,
      visualLines,
      renderedVisualLines,
      visualCursor,
      visualScrollRow,
      visualToLogicalMap,
      transformedToLogicalMaps,
      visualToTransformedMap,
      transformationsByLine,
      visualLayout,
      setText,
      insert,
      newline,
      backspace,
      del,
      move,
      undo,
      redo,
      replaceRange,
      replaceRangeByOffset,
      moveToOffset,
      getOffset,
      moveToVisualPosition,
      getLogicalPositionFromVisual,
      getExpandedPasteAtLineCallback,
      togglePasteExpansion,
      expandedPaste,
      deleteWordLeft,
      deleteWordRight,
      killLineRight,
      killLineLeft,
      handleInput,
      openInExternalEditor,
      vimDeleteWordForward,
      vimDeleteWordBackward,
      vimDeleteWordEnd,
      vimDeleteBigWordForward,
      vimDeleteBigWordBackward,
      vimDeleteBigWordEnd,
      vimChangeWordForward,
      vimChangeWordBackward,
      vimChangeWordEnd,
      vimChangeBigWordForward,
      vimChangeBigWordBackward,
      vimChangeBigWordEnd,
      vimDeleteLine,
      vimChangeLine,
      vimDeleteToEndOfLine,
      vimChangeToEndOfLine,
      vimChangeMovement,
      vimMoveLeft,
      vimMoveRight,
      vimMoveUp,
      vimMoveDown,
      vimMoveWordForward,
      vimMoveWordBackward,
      vimMoveWordEnd,
      vimMoveBigWordForward,
      vimMoveBigWordBackward,
      vimMoveBigWordEnd,
      vimDeleteChar,
      vimInsertAtCursor,
      vimAppendAtCursor,
      vimOpenLineBelow,
      vimOpenLineAbove,
      vimAppendAtLineEnd,
      vimInsertAtLineStart,
      vimMoveToLineStart,
      vimMoveToLineEnd,
      vimMoveToFirstNonWhitespace,
      vimMoveToFirstLine,
      vimMoveToLastLine,
      vimMoveToLine,
      vimEscapeInsertMode,
    ],
  );
  return returnValue;
}

export interface TextBuffer {
  // State
  lines: string[]; // Logical lines
  text: string;
  cursor: [number, number]; // Logical cursor [row, col]
  /**
   * When the user moves the caret vertically we try to keep their original
   * horizontal column even when passing through shorter lines.  We remember
   * that *preferred* column in this field while the user is still travelling
   * vertically.  Any explicit horizontal movement resets the preference.
   */
  preferredCol: number | null; // Preferred visual column
  selectionAnchor: [number, number] | null; // Logical selection anchor
  pastedContent: Record<string, string>;

  // Visual state (handles wrapping)
  allVisualLines: string[]; // All visual lines for the current text and viewport width.
  viewportVisualLines: string[]; // The subset of visual lines to be rendered based on visualScrollRow and viewport.height
  visualCursor: [number, number]; // Visual cursor [row, col] relative to the start of all visualLines
  visualScrollRow: number; // Scroll position for visual lines (index of the first visible visual line)
  /**
   * For each visual line (by absolute index in allVisualLines) provides a tuple
   * [logicalLineIndex, startColInLogical] that maps where that visual line
   * begins within the logical buffer. Indices are code-point based.
   */
  visualToLogicalMap: Array<[number, number]>;
  /**
   * For each logical line, an array mapping transformed positions (in the transformed
   * line) back to logical column indices.
   */
  transformedToLogicalMaps: number[][];
  /**
   * For each visual line (absolute index across all visual lines), the start index
   * within that logical line's transformed content.
   */
  visualToTransformedMap: number[];
  /** Cached transformations per logical line */
  transformationsByLine: Transformation[][];
  visualLayout: VisualLayout;

  // Actions

  /**
   * Replaces the entire buffer content with the provided text.
   * The operation is undoable.
   */
  setText: (text: string, cursorPosition?: 'start' | 'end' | number) => void;
  /**
   * Insert a single character or string without newlines.
   */
  insert: (ch: string, opts?: { paste?: boolean }) => void;
  newline: () => void;
  backspace: () => void;
  del: () => void;
  move: (dir: Direction) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Replaces the text within the specified range with new text.
   * Handles both single-line and multi-line ranges.
   *
   * @param startRow The starting row index (inclusive).
   * @param startCol The starting column index (inclusive, code-point based).
   * @param endRow The ending row index (inclusive).
   * @param endCol The ending column index (exclusive, code-point based).
   * @param text The new text to insert.
   * @returns True if the buffer was modified, false otherwise.
   */
  replaceRange: (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ) => void;
  /**
   * Delete the word to the *left* of the caret, mirroring common
   * Ctrl/Alt+Backspace behaviour in editors & terminals. Both the adjacent
   * whitespace *and* the word characters immediately preceding the caret are
   * removed.  If the caret is already at column‑0 this becomes a no-op.
   */
  deleteWordLeft: () => void;
  /**
   * Delete the word to the *right* of the caret, akin to many editors'
   * Ctrl/Alt+Delete shortcut.  Removes any whitespace/punctuation that
   * follows the caret and the next contiguous run of word characters.
   */
  deleteWordRight: () => void;

  /**
   * Deletes text from the cursor to the end of the current line.
   */
  killLineRight: () => void;
  /**
   * Deletes text from the start of the current line to the cursor.
   */
  killLineLeft: () => void;
  /**
   * High level "handleInput" – receives what Ink gives us.
   */
  handleInput: (key: Key) => boolean;
  /**
   * Opens the current buffer contents in the user's preferred terminal text
   * editor ($VISUAL or $EDITOR, falling back to "vi").  The method blocks
   * until the editor exits, then reloads the file and replaces the in‑memory
   * buffer with whatever the user saved.
   *
   * The operation is treated as a single undoable edit – we snapshot the
   * previous state *once* before launching the editor so one `undo()` will
   * revert the entire change set.
   *
   * Note: We purposefully rely on the *synchronous* spawn API so that the
   * calling process genuinely waits for the editor to close before
   * continuing.  This mirrors Git's behaviour and simplifies downstream
   * control‑flow (callers can simply `await` the Promise).
   */
  openInExternalEditor: () => Promise<void>;

  replaceRangeByOffset: (
    startOffset: number,
    endOffset: number,
    replacementText: string,
  ) => void;
  getOffset: () => number;
  moveToOffset(offset: number): void;
  moveToVisualPosition(visualRow: number, visualCol: number): void;
  /**
   * Convert visual coordinates to logical position without moving cursor.
   * Returns null if the position is out of bounds.
   */
  getLogicalPositionFromVisual(
    visualRow: number,
    visualCol: number,
  ): { row: number; col: number } | null;
  /**
   * Check if a line index falls within an expanded paste region.
   * Returns the paste placeholder ID if found, null otherwise.
   */
  getExpandedPasteAtLine(lineIndex: number): string | null;
  /**
   * Toggle expansion state for a paste placeholder.
   * If collapsed, expands to show full content inline.
   * If expanded, collapses back to placeholder.
   */
  togglePasteExpansion(id: string, row: number, col: number): void;
  /**
   * The current expanded paste info (read-only).
   */
  expandedPaste: ExpandedPasteInfo | null;

  // Vim-specific operations
  /**
   * Delete N words forward from cursor position (vim 'dw' command)
   */
  vimDeleteWordForward: (count: number) => void;
  /**
   * Delete N words backward from cursor position (vim 'db' command)
   */
  vimDeleteWordBackward: (count: number) => void;
  /**
   * Delete to end of N words from cursor position (vim 'de' command)
   */
  vimDeleteWordEnd: (count: number) => void;
  /**
   * Delete N big words forward from cursor position (vim 'dW' command)
   */
  vimDeleteBigWordForward: (count: number) => void;
  /**
   * Delete N big words backward from cursor position (vim 'dB' command)
   */
  vimDeleteBigWordBackward: (count: number) => void;
  /**
   * Delete to end of N big words from cursor position (vim 'dE' command)
   */
  vimDeleteBigWordEnd: (count: number) => void;
  /**
   * Change N words forward from cursor position (vim 'cw' command)
   */
  vimChangeWordForward: (count: number) => void;
  /**
   * Change N words backward from cursor position (vim 'cb' command)
   */
  vimChangeWordBackward: (count: number) => void;
  /**
   * Change to end of N words from cursor position (vim 'ce' command)
   */
  vimChangeWordEnd: (count: number) => void;
  /**
   * Change N big words forward from cursor position (vim 'cW' command)
   */
  vimChangeBigWordForward: (count: number) => void;
  /**
   * Change N big words backward from cursor position (vim 'cB' command)
   */
  vimChangeBigWordBackward: (count: number) => void;
  /**
   * Change to end of N big words from cursor position (vim 'cE' command)
   */
  vimChangeBigWordEnd: (count: number) => void;
  /**
   * Delete N lines from cursor position (vim 'dd' command)
   */
  vimDeleteLine: (count: number) => void;
  /**
   * Change N lines from cursor position (vim 'cc' command)
   */
  vimChangeLine: (count: number) => void;
  /**
   * Delete from cursor to end of line (vim 'D' command)
   */
  vimDeleteToEndOfLine: () => void;
  /**
   * Change from cursor to end of line (vim 'C' command)
   */
  vimChangeToEndOfLine: () => void;
  /**
   * Change movement operations (vim 'ch', 'cj', 'ck', 'cl' commands)
   */
  vimChangeMovement: (movement: 'h' | 'j' | 'k' | 'l', count: number) => void;
  /**
   * Move cursor left N times (vim 'h' command)
   */
  vimMoveLeft: (count: number) => void;
  /**
   * Move cursor right N times (vim 'l' command)
   */
  vimMoveRight: (count: number) => void;
  /**
   * Move cursor up N times (vim 'k' command)
   */
  vimMoveUp: (count: number) => void;
  /**
   * Move cursor down N times (vim 'j' command)
   */
  vimMoveDown: (count: number) => void;
  /**
   * Move cursor forward N words (vim 'w' command)
   */
  vimMoveWordForward: (count: number) => void;
  /**
   * Move cursor backward N words (vim 'b' command)
   */
  vimMoveWordBackward: (count: number) => void;
  /**
   * Move cursor to end of Nth word (vim 'e' command)
   */
  vimMoveWordEnd: (count: number) => void;
  /**
   * Move cursor forward N big words (vim 'W' command)
   */
  vimMoveBigWordForward: (count: number) => void;
  /**
   * Move cursor backward N big words (vim 'B' command)
   */
  vimMoveBigWordBackward: (count: number) => void;
  /**
   * Move cursor to end of Nth big word (vim 'E' command)
   */
  vimMoveBigWordEnd: (count: number) => void;
  /**
   * Delete N characters at cursor (vim 'x' command)
   */
  vimDeleteChar: (count: number) => void;
  /**
   * Enter insert mode at cursor (vim 'i' command)
   */
  vimInsertAtCursor: () => void;
  /**
   * Enter insert mode after cursor (vim 'a' command)
   */
  vimAppendAtCursor: () => void;
  /**
   * Open new line below and enter insert mode (vim 'o' command)
   */
  vimOpenLineBelow: () => void;
  /**
   * Open new line above and enter insert mode (vim 'O' command)
   */
  vimOpenLineAbove: () => void;
  /**
   * Move to end of line and enter insert mode (vim 'A' command)
   */
  vimAppendAtLineEnd: () => void;
  /**
   * Move to first non-whitespace and enter insert mode (vim 'I' command)
   */
  vimInsertAtLineStart: () => void;
  /**
   * Move cursor to beginning of line (vim '0' command)
   */
  vimMoveToLineStart: () => void;
  /**
   * Move cursor to end of line (vim '$' command)
   */
  vimMoveToLineEnd: () => void;
  /**
   * Move cursor to first non-whitespace character (vim '^' command)
   */
  vimMoveToFirstNonWhitespace: () => void;
  /**
   * Move cursor to first line (vim 'gg' command)
   */
  vimMoveToFirstLine: () => void;
  /**
   * Move cursor to last line (vim 'G' command)
   */
  vimMoveToLastLine: () => void;
  /**
   * Move cursor to specific line number (vim '[N]G' command)
   */
  vimMoveToLine: (lineNumber: number) => void;
  /**
   * Handle escape from insert mode (moves cursor left if not at line start)
   */
  vimEscapeInsertMode: () => void;
}
