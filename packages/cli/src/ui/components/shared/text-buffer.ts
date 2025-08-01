/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import pathMod from 'path';
import { useState, useCallback, useEffect, useMemo, useReducer } from 'react';
import stringWidth from 'string-width';
import { unescapePath } from '@google/gemini-cli-core';
import { toCodePoints, cpLen, cpSlice } from '../../utils/textUtils.js';
import { handleVimAction, VimAction } from './vim-buffer-actions.js';

export type Direction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wordLeft'
  | 'wordRight'
  | 'home'
  | 'end';

// Simple helper for word‑wise ops.
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) {
    return false;
  }
  return !/[\s,.;!?]/.test(ch);
}

// Vim-specific word boundary functions
export const findNextWordStart = (
  text: string,
  currentOffset: number,
): number => {
  let i = currentOffset;

  if (i >= text.length) return i;

  const currentChar = text[i];

  // Skip current word/sequence based on character type
  if (/\w/.test(currentChar)) {
    // Skip current word characters
    while (i < text.length && /\w/.test(text[i])) {
      i++;
    }
  } else if (!/\s/.test(currentChar)) {
    // Skip current non-word, non-whitespace characters (like "/", ".", etc.)
    while (i < text.length && !/\w/.test(text[i]) && !/\s/.test(text[i])) {
      i++;
    }
  }

  // Skip whitespace
  while (i < text.length && /\s/.test(text[i])) {
    i++;
  }

  // If we reached the end of text and there's no next word,
  // vim behavior for dw is to delete to the end of the current word
  if (i >= text.length) {
    // Go back to find the end of the last word
    let endOfLastWord = text.length - 1;
    while (endOfLastWord >= 0 && /\s/.test(text[endOfLastWord])) {
      endOfLastWord--;
    }
    // For dw on last word, return position AFTER the last character to delete entire word
    return Math.max(currentOffset + 1, endOfLastWord + 1);
  }

  return i;
};

export const findPrevWordStart = (
  text: string,
  currentOffset: number,
): number => {
  let i = currentOffset;

  // If at beginning of text, return current position
  if (i <= 0) {
    return currentOffset;
  }

  // Move back one character to start searching
  i--;

  // Skip whitespace moving backwards
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n')) {
    i--;
  }

  if (i < 0) {
    return 0; // Reached beginning of text
  }

  const charAtI = text[i];

  if (/\w/.test(charAtI)) {
    // We're in a word, move to its beginning
    while (i >= 0 && /\w/.test(text[i])) {
      i--;
    }
    return i + 1; // Return first character of word
  } else {
    // We're in punctuation, move to its beginning
    while (
      i >= 0 &&
      !/\w/.test(text[i]) &&
      text[i] !== ' ' &&
      text[i] !== '\t' &&
      text[i] !== '\n'
    ) {
      i--;
    }
    return i + 1; // Return first character of punctuation sequence
  }
};

export const findWordEnd = (text: string, currentOffset: number): number => {
  let i = currentOffset;

  // If we're already at the end of a word, advance to next word
  if (
    i < text.length &&
    /\w/.test(text[i]) &&
    (i + 1 >= text.length || !/\w/.test(text[i + 1]))
  ) {
    // We're at the end of a word, move forward to find next word
    i++;
    // Skip whitespace/punctuation to find next word
    while (i < text.length && !/\w/.test(text[i])) {
      i++;
    }
  }

  // If we're not on a word character, find the next word
  if (i < text.length && !/\w/.test(text[i])) {
    while (i < text.length && !/\w/.test(text[i])) {
      i++;
    }
  }

  // Move to end of current word
  while (i < text.length && /\w/.test(text[i])) {
    i++;
  }

  // Move back one to be on the last character of the word
  return Math.max(currentOffset, i - 1);
};

// Helper functions for vim operations
export const getOffsetFromPosition = (
  row: number,
  col: number,
  lines: string[],
): number => {
  let offset = 0;
  for (let i = 0; i < row; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  offset += col;
  return offset;
};

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

/**
 * Strip characters that can break terminal rendering.
 *
 * Strip ANSI escape codes and control characters except for line breaks.
 * Control characters such as delete break terminal UI rendering.
 */
function stripUnsafeCharacters(str: string): string {
  const stripped = stripAnsi(str);
  return toCodePoints(stripped)
    .filter((char) => {
      if (char.length > 1) return false;
      const code = char.codePointAt(0);
      if (code === undefined) {
        return false;
      }
      const isUnsafe =
        code === 127 || (code <= 31 && code !== 13 && code !== 10);
      return !isUnsafe;
    })
    .join('');
}

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
}

interface UndoHistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
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

// Helper to calculate visual lines and map cursor positions
function calculateVisualLayout(
  logicalLines: string[],
  logicalCursor: [number, number],
  viewportWidth: number,
): {
  visualLines: string[];
  visualCursor: [number, number];
  logicalToVisualMap: Array<Array<[number, number]>>; // For each logical line, an array of [visualLineIndex, startColInLogical]
  visualToLogicalMap: Array<[number, number]>; // For each visual line, its [logicalLineIndex, startColInLogical]
} {
  const visualLines: string[] = [];
  const logicalToVisualMap: Array<Array<[number, number]>> = [];
  const visualToLogicalMap: Array<[number, number]> = [];
  let currentVisualCursor: [number, number] = [0, 0];

  logicalLines.forEach((logLine, logIndex) => {
    logicalToVisualMap[logIndex] = [];
    if (logLine.length === 0) {
      // Handle empty logical line
      logicalToVisualMap[logIndex].push([visualLines.length, 0]);
      visualToLogicalMap.push([logIndex, 0]);
      visualLines.push('');
      if (logIndex === logicalCursor[0] && logicalCursor[1] === 0) {
        currentVisualCursor = [visualLines.length - 1, 0];
      }
    } else {
      // Non-empty logical line
      let currentPosInLogLine = 0; // Tracks position within the current logical line (code point index)
      const codePointsInLogLine = toCodePoints(logLine);

      while (currentPosInLogLine < codePointsInLogLine.length) {
        let currentChunk = '';
        let currentChunkVisualWidth = 0;
        let numCodePointsInChunk = 0;
        let lastWordBreakPoint = -1; // Index in codePointsInLogLine for word break
        let numCodePointsAtLastWordBreak = 0;

        // Iterate through code points to build the current visual line (chunk)
        for (let i = currentPosInLogLine; i < codePointsInLogLine.length; i++) {
          const char = codePointsInLogLine[i];
          const charVisualWidth = stringWidth(char);

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
              } else if (
                numCodePointsInChunk === 0 &&
                charVisualWidth <= viewportWidth
              ) {
                // This case should ideally be caught by the next iteration if the char fits.
                // If it doesn't fit (because currentChunkVisualWidth was already > 0 from a previous char that filled the line),
                // then numCodePointsInChunk would not be 0.
                // This branch means the current char *itself* doesn't fit an empty line, which is handled by the above.
                // If we are here, it means the loop should break and the current chunk (which is empty) is finalized.
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

        // If the inner loop completed without breaking (i.e., remaining text fits)
        // or if the loop broke but numCodePointsInChunk is still 0 (e.g. first char too wide for empty line)
        if (
          numCodePointsInChunk === 0 &&
          currentPosInLogLine < codePointsInLogLine.length
        ) {
          // This can happen if the very first character considered for a new visual line is wider than the viewport.
          // In this case, we take that single character.
          const firstChar = codePointsInLogLine[currentPosInLogLine];
          currentChunk = firstChar;
          numCodePointsInChunk = 1; // Ensure we advance
        }

        // If after everything, numCodePointsInChunk is still 0 but we haven't processed the whole logical line,
        // it implies an issue, like viewportWidth being 0 or less. Avoid infinite loop.
        if (
          numCodePointsInChunk === 0 &&
          currentPosInLogLine < codePointsInLogLine.length
        ) {
          // Force advance by one character to prevent infinite loop if something went wrong
          currentChunk = codePointsInLogLine[currentPosInLogLine];
          numCodePointsInChunk = 1;
        }

        logicalToVisualMap[logIndex].push([
          visualLines.length,
          currentPosInLogLine,
        ]);
        visualToLogicalMap.push([logIndex, currentPosInLogLine]);
        visualLines.push(currentChunk);

        // Cursor mapping logic
        // Note: currentPosInLogLine here is the start of the currentChunk within the logical line.
        if (logIndex === logicalCursor[0]) {
          const cursorLogCol = logicalCursor[1]; // This is a code point index
          if (
            cursorLogCol >= currentPosInLogLine &&
            cursorLogCol < currentPosInLogLine + numCodePointsInChunk // Cursor is within this chunk
          ) {
            currentVisualCursor = [
              visualLines.length - 1,
              cursorLogCol - currentPosInLogLine, // Visual col is also code point index within visual line
            ];
          } else if (
            cursorLogCol === currentPosInLogLine + numCodePointsInChunk &&
            numCodePointsInChunk > 0
          ) {
            // Cursor is exactly at the end of this non-empty chunk
            currentVisualCursor = [
              visualLines.length - 1,
              numCodePointsInChunk,
            ];
          }
        }

        const logicalStartOfThisChunk = currentPosInLogLine;
        currentPosInLogLine += numCodePointsInChunk;

        // If the chunk processed did not consume the entire logical line,
        // and the character immediately following the chunk is a space,
        // advance past this space as it acted as a delimiter for word wrapping.
        if (
          logicalStartOfThisChunk + numCodePointsInChunk <
            codePointsInLogLine.length &&
          currentPosInLogLine < codePointsInLogLine.length && // Redundant if previous is true, but safe
          codePointsInLogLine[currentPosInLogLine] === ' '
        ) {
          currentPosInLogLine++;
        }
      }
      // After all chunks of a non-empty logical line are processed,
      // if the cursor is at the very end of this logical line, update visual cursor.
      if (
        logIndex === logicalCursor[0] &&
        logicalCursor[1] === codePointsInLogLine.length // Cursor at end of logical line
      ) {
        const lastVisualLineIdx = visualLines.length - 1;
        if (
          lastVisualLineIdx >= 0 &&
          visualLines[lastVisualLineIdx] !== undefined
        ) {
          currentVisualCursor = [
            lastVisualLineIdx,
            cpLen(visualLines[lastVisualLineIdx]), // Cursor at end of last visual line for this logical line
          ];
        }
      }
    }
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
    }
    currentVisualCursor = [0, 0];
  }
  // Handle cursor at the very end of the text (after all processing)
  // This case might be covered by the loop end condition now, but kept for safety.
  else if (
    logicalCursor[0] === logicalLines.length - 1 &&
    logicalCursor[1] === cpLen(logicalLines[logicalLines.length - 1]) &&
    visualLines.length > 0
  ) {
    const lastVisLineIdx = visualLines.length - 1;
    currentVisualCursor = [lastVisLineIdx, cpLen(visualLines[lastVisLineIdx])];
  }

  return {
    visualLines,
    visualCursor: currentVisualCursor,
    logicalToVisualMap,
    visualToLogicalMap,
  };
}

// --- Start of reducer logic ---

export interface TextBufferState {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  preferredCol: number | null; // This is visual preferred col
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  clipboard: string | null;
  selectionAnchor: [number, number] | null;
  viewportWidth: number;
}

const historyLimit = 100;

export const pushUndo = (currentState: TextBufferState): TextBufferState => {
  const snapshot = {
    lines: [...currentState.lines],
    cursorRow: currentState.cursorRow,
    cursorCol: currentState.cursorCol,
  };
  const newStack = [...currentState.undoStack, snapshot];
  if (newStack.length > historyLimit) {
    newStack.shift();
  }
  return { ...currentState, undoStack: newStack, redoStack: [] };
};

export type TextBufferAction =
  | { type: 'set_text'; payload: string; pushToUndo?: boolean }
  | { type: 'insert'; payload: string }
  | { type: 'backspace' }
  | {
      type: 'move';
      payload: {
        dir: Direction;
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
  | { type: 'set_viewport_width'; payload: number }
  | { type: 'vim_delete_word_forward'; payload: { count: number } }
  | { type: 'vim_delete_word_backward'; payload: { count: number } }
  | { type: 'vim_delete_word_end'; payload: { count: number } }
  | { type: 'vim_change_word_forward'; payload: { count: number } }
  | { type: 'vim_change_word_backward'; payload: { count: number } }
  | { type: 'vim_change_word_end'; payload: { count: number } }
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
  | { type: 'vim_escape_insert_mode' };

export function textBufferReducer(
  state: TextBufferState,
  action: TextBufferAction,
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
      const lastNewLineIndex = lines.length - 1;
      return {
        ...nextState,
        lines,
        cursorRow: lastNewLineIndex,
        cursorCol: cpLen(lines[lastNewLineIndex] ?? ''),
        preferredCol: null,
      };
    }

    case 'insert': {
      const nextState = pushUndoLocal(state);
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      const str = stripUnsafeCharacters(
        action.payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      );
      const parts = str.split('\n');
      const lineContent = currentLine(newCursorRow);
      const before = cpSlice(lineContent, 0, newCursorCol);
      const after = cpSlice(lineContent, newCursorCol);

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
        newCursorRow = newCursorRow + parts.length - 1;
        newCursorCol = cpLen(lastPartOriginal);
      } else {
        newLines[newCursorRow] = before + parts[0] + after;
        newCursorCol = cpLen(before) + cpLen(parts[0]);
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
      };
    }

    case 'backspace': {
      const nextState = pushUndoLocal(state);
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      if (newCursorCol === 0 && newCursorRow === 0) return state;

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

    case 'set_viewport_width': {
      if (action.payload === state.viewportWidth) {
        return state;
      }
      return { ...state, viewportWidth: action.payload };
    }

    case 'move': {
      const { dir } = action.payload;
      const { lines, cursorRow, cursorCol, viewportWidth } = state;
      const visualLayout = calculateVisualLayout(
        lines,
        [cursorRow, cursorCol],
        viewportWidth,
      );
      const { visualLines, visualCursor, visualToLogicalMap } = visualLayout;

      let newVisualRow = visualCursor[0];
      let newVisualCol = visualCursor[1];
      let newPreferredCol = state.preferredCol;

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
        case 'wordLeft': {
          const { cursorRow, cursorCol, lines } = state;
          if (cursorCol === 0 && cursorRow === 0) return state;

          let newCursorRow = cursorRow;
          let newCursorCol = cursorCol;

          if (cursorCol === 0) {
            newCursorRow--;
            newCursorCol = cpLen(lines[newCursorRow] ?? '');
          } else {
            const lineContent = lines[cursorRow];
            const arr = toCodePoints(lineContent);
            let start = cursorCol;
            let onlySpaces = true;
            for (let i = 0; i < start; i++) {
              if (isWordChar(arr[i])) {
                onlySpaces = false;
                break;
              }
            }
            if (onlySpaces && start > 0) {
              start--;
            } else {
              while (start > 0 && !isWordChar(arr[start - 1])) start--;
              while (start > 0 && isWordChar(arr[start - 1])) start--;
            }
            newCursorCol = start;
          }
          return {
            ...state,
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: null,
          };
        }
        case 'wordRight': {
          const { cursorRow, cursorCol, lines } = state;
          if (
            cursorRow === lines.length - 1 &&
            cursorCol === cpLen(lines[cursorRow] ?? '')
          ) {
            return state;
          }

          let newCursorRow = cursorRow;
          let newCursorCol = cursorCol;
          const lineContent = lines[cursorRow] ?? '';
          const arr = toCodePoints(lineContent);

          if (cursorCol >= arr.length) {
            newCursorRow++;
            newCursorCol = 0;
          } else {
            let end = cursorCol;
            while (end < arr.length && !isWordChar(arr[end])) end++;
            while (end < arr.length && isWordChar(arr[end])) end++;
            newCursorCol = end;
          }
          return {
            ...state,
            cursorRow: newCursorRow,
            cursorCol: newCursorCol,
            preferredCol: null,
          };
        }
        default:
          break;
      }

      if (visualToLogicalMap[newVisualRow]) {
        const [logRow, logStartCol] = visualToLogicalMap[newVisualRow];
        return {
          ...state,
          cursorRow: logRow,
          cursorCol: clamp(
            logStartCol + newVisualCol,
            0,
            cpLen(state.lines[logRow] ?? ''),
          ),
          preferredCol: newPreferredCol,
        };
      }
      return state;
    }

    case 'delete': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = pushUndoLocal(state);
        const newLines = [...nextState.lines];
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          cpSlice(lineContent, cursorCol + 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      } else if (cursorRow < lines.length - 1) {
        const nextState = pushUndoLocal(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      return state;
    }

    case 'delete_word_left': {
      const { cursorRow, cursorCol } = state;
      if (cursorCol === 0 && cursorRow === 0) return state;
      if (cursorCol === 0) {
        // Act as a backspace
        const nextState = pushUndoLocal(state);
        const prevLineContent = currentLine(cursorRow - 1);
        const currentLineContentVal = currentLine(cursorRow);
        const newCol = cpLen(prevLineContent);
        const newLines = [...nextState.lines];
        newLines[cursorRow - 1] = prevLineContent + currentLineContentVal;
        newLines.splice(cursorRow, 1);
        return {
          ...nextState,
          lines: newLines,
          cursorRow: cursorRow - 1,
          cursorCol: newCol,
          preferredCol: null,
        };
      }
      const nextState = pushUndoLocal(state);
      const lineContent = currentLine(cursorRow);
      const arr = toCodePoints(lineContent);
      let start = cursorCol;
      let onlySpaces = true;
      for (let i = 0; i < start; i++) {
        if (isWordChar(arr[i])) {
          onlySpaces = false;
          break;
        }
      }
      if (onlySpaces && start > 0) {
        start--;
      } else {
        while (start > 0 && !isWordChar(arr[start - 1])) start--;
        while (start > 0 && isWordChar(arr[start - 1])) start--;
      }
      const newLines = [...nextState.lines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, start) + cpSlice(lineContent, cursorCol);
      return {
        ...nextState,
        lines: newLines,
        cursorCol: start,
        preferredCol: null,
      };
    }

    case 'delete_word_right': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      const arr = toCodePoints(lineContent);
      if (cursorCol >= arr.length && cursorRow === lines.length - 1)
        return state;
      if (cursorCol >= arr.length) {
        // Act as a delete
        const nextState = pushUndoLocal(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      const nextState = pushUndoLocal(state);
      let end = cursorCol;
      while (end < arr.length && !isWordChar(arr[end])) end++;
      while (end < arr.length && isWordChar(arr[end])) end++;
      const newLines = [...nextState.lines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, cursorCol) + cpSlice(lineContent, end);
      return { ...nextState, lines: newLines, preferredCol: null };
    }

    case 'kill_line_right': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = pushUndoLocal(state);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = cpSlice(lineContent, 0, cursorCol);
        return { ...nextState, lines: newLines };
      } else if (cursorRow < lines.length - 1) {
        // Act as a delete
        const nextState = pushUndoLocal(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      return state;
    }

    case 'kill_line_left': {
      const { cursorRow, cursorCol } = state;
      if (cursorCol > 0) {
        const nextState = pushUndoLocal(state);
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
      return state;
    }

    case 'undo': {
      const stateToRestore = state.undoStack[state.undoStack.length - 1];
      if (!stateToRestore) return state;

      const currentSnapshot = {
        lines: [...state.lines],
        cursorRow: state.cursorRow,
        cursorCol: state.cursorCol,
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

      const currentSnapshot = {
        lines: [...state.lines],
        cursorRow: state.cursorRow,
        cursorCol: state.cursorCol,
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
      return replaceRangeInternal(
        nextState,
        startRow,
        startCol,
        endRow,
        endCol,
        text,
      );
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
    case 'vim_change_word_forward':
    case 'vim_change_word_backward':
    case 'vim_change_word_end':
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

    default: {
      const exhaustiveCheck: never = action;
      console.error(`Unknown action encountered: ${exhaustiveCheck}`);
      return state;
    }
  }
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
}: UseTextBufferProps): TextBuffer {
  const initialState = useMemo((): TextBufferState => {
    const lines = initialText.split('\n');
    const [initialCursorRow, initialCursorCol] = calculateInitialCursorPosition(
      lines.length === 0 ? [''] : lines,
      initialCursorOffset,
    );
    return {
      lines: lines.length === 0 ? [''] : lines,
      cursorRow: initialCursorRow,
      cursorCol: initialCursorCol,
      preferredCol: null,
      undoStack: [],
      redoStack: [],
      clipboard: null,
      selectionAnchor: null,
      viewportWidth: viewport.width,
    };
  }, [initialText, initialCursorOffset, viewport.width]);

  const [state, dispatch] = useReducer(textBufferReducer, initialState);
  const { lines, cursorRow, cursorCol, preferredCol, selectionAnchor } = state;

  const text = useMemo(() => lines.join('\n'), [lines]);

  const visualLayout = useMemo(
    () =>
      calculateVisualLayout(lines, [cursorRow, cursorCol], state.viewportWidth),
    [lines, cursorRow, cursorCol, state.viewportWidth],
  );

  const { visualLines, visualCursor } = visualLayout;

  const [visualScrollRow, setVisualScrollRow] = useState<number>(0);

  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

  useEffect(() => {
    dispatch({ type: 'set_viewport_width', payload: viewport.width });
  }, [viewport.width]);

  // Update visual scroll (vertical)
  useEffect(() => {
    const { height } = viewport;
    let newVisualScrollRow = visualScrollRow;

    if (visualCursor[0] < visualScrollRow) {
      newVisualScrollRow = visualCursor[0];
    } else if (visualCursor[0] >= visualScrollRow + height) {
      newVisualScrollRow = visualCursor[0] - height + 1;
    }
    if (newVisualScrollRow !== visualScrollRow) {
      setVisualScrollRow(newVisualScrollRow);
    }
  }, [visualCursor, visualScrollRow, viewport]);

  const insert = useCallback(
    (ch: string, { paste = false }: { paste?: boolean } = {}): void => {
      if (/[\n\r]/.test(ch)) {
        dispatch({ type: 'insert', payload: ch });
        return;
      }

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
        if (isValidPath(unescapePath(potentialPath))) {
          ch = `@${potentialPath} `;
        }
      }

      let currentText = '';
      for (const char of toCodePoints(ch)) {
        if (char.codePointAt(0) === 127) {
          if (currentText.length > 0) {
            dispatch({ type: 'insert', payload: currentText });
            currentText = '';
          }
          dispatch({ type: 'backspace' });
        } else {
          currentText += char;
        }
      }
      if (currentText.length > 0) {
        dispatch({ type: 'insert', payload: currentText });
      }
    },
    [isValidPath, shellModeActive],
  );

  const newline = useCallback((): void => {
    dispatch({ type: 'insert', payload: '\n' });
  }, []);

  const backspace = useCallback((): void => {
    dispatch({ type: 'backspace' });
  }, []);

  const del = useCallback((): void => {
    dispatch({ type: 'delete' });
  }, []);

  const move = useCallback((dir: Direction): void => {
    dispatch({ type: 'move', payload: { dir } });
  }, []);

  const undo = useCallback((): void => {
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback((): void => {
    dispatch({ type: 'redo' });
  }, []);

  const setText = useCallback((newText: string): void => {
    dispatch({ type: 'set_text', payload: newText });
  }, []);

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

  const vimChangeWordForward = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_word_forward', payload: { count } });
  }, []);

  const vimChangeWordBackward = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_word_backward', payload: { count } });
  }, []);

  const vimChangeWordEnd = useCallback((count: number): void => {
    dispatch({ type: 'vim_change_word_end', payload: { count } });
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

  const openInExternalEditor = useCallback(
    async (opts: { editor?: string } = {}): Promise<void> => {
      const editor =
        opts.editor ??
        process.env['VISUAL'] ??
        process.env['EDITOR'] ??
        (process.platform === 'win32' ? 'notepad' : 'vi');
      const tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'gemini-edit-'));
      const filePath = pathMod.join(tmpDir, 'buffer.txt');
      fs.writeFileSync(filePath, text, 'utf8');

      dispatch({ type: 'create_undo_snapshot' });

      const wasRaw = stdin?.isRaw ?? false;
      try {
        setRawMode?.(false);
        const { status, error } = spawnSync(editor, [filePath], {
          stdio: 'inherit',
        });
        if (error) throw error;
        if (typeof status === 'number' && status !== 0)
          throw new Error(`External editor exited with status ${status}`);

        let newText = fs.readFileSync(filePath, 'utf8');
        newText = newText.replace(/\r\n?/g, '\n');
        dispatch({ type: 'set_text', payload: newText, pushToUndo: false });
      } catch (err) {
        console.error('[useTextBuffer] external editor error', err);
      } finally {
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
    },
    [text, stdin, setRawMode],
  );

  const handleInput = useCallback(
    (key: {
      name: string;
      ctrl: boolean;
      meta: boolean;
      shift: boolean;
      paste: boolean;
      sequence: string;
    }): void => {
      const { sequence: input } = key;

      if (
        key.name === 'return' ||
        input === '\r' ||
        input === '\n' ||
        input === '\\\r' // VSCode terminal represents shift + enter this way
      )
        newline();
      else if (key.name === 'left' && !key.meta && !key.ctrl) move('left');
      else if (key.ctrl && key.name === 'b') move('left');
      else if (key.name === 'right' && !key.meta && !key.ctrl) move('right');
      else if (key.ctrl && key.name === 'f') move('right');
      else if (key.name === 'up') move('up');
      else if (key.name === 'down') move('down');
      else if ((key.ctrl || key.meta) && key.name === 'left') move('wordLeft');
      else if (key.meta && key.name === 'b') move('wordLeft');
      else if ((key.ctrl || key.meta) && key.name === 'right')
        move('wordRight');
      else if (key.meta && key.name === 'f') move('wordRight');
      else if (key.name === 'home') move('home');
      else if (key.ctrl && key.name === 'a') move('home');
      else if (key.name === 'end') move('end');
      else if (key.ctrl && key.name === 'e') move('end');
      else if (key.ctrl && key.name === 'w') deleteWordLeft();
      else if (
        (key.meta || key.ctrl) &&
        (key.name === 'backspace' || input === '\x7f')
      )
        deleteWordLeft();
      else if ((key.meta || key.ctrl) && key.name === 'delete')
        deleteWordRight();
      else if (
        key.name === 'backspace' ||
        input === '\x7f' ||
        (key.ctrl && key.name === 'h')
      )
        backspace();
      else if (key.name === 'delete' || (key.ctrl && key.name === 'd')) del();
      else if (input && !key.ctrl && !key.meta) {
        insert(input, { paste: key.paste });
      }
    },
    [newline, move, deleteWordLeft, deleteWordRight, backspace, del, insert],
  );

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

  const returnValue: TextBuffer = {
    lines,
    text,
    cursor: [cursorRow, cursorCol],
    preferredCol,
    selectionAnchor,

    allVisualLines: visualLines,
    viewportVisualLines: renderedVisualLines,
    visualCursor,
    visualScrollRow,

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
    vimChangeWordForward,
    vimChangeWordBackward,
    vimChangeWordEnd,
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
  };
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

  // Visual state (handles wrapping)
  allVisualLines: string[]; // All visual lines for the current text and viewport width.
  viewportVisualLines: string[]; // The subset of visual lines to be rendered based on visualScrollRow and viewport.height
  visualCursor: [number, number]; // Visual cursor [row, col] relative to the start of all visualLines
  visualScrollRow: number; // Scroll position for visual lines (index of the first visible visual line)

  // Actions

  /**
   * Replaces the entire buffer content with the provided text.
   * The operation is undoable.
   */
  setText: (text: string) => void;
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
  handleInput: (key: {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    paste: boolean;
    sequence: string;
  }) => void;
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
  openInExternalEditor: (opts?: { editor?: string }) => Promise<void>;

  replaceRangeByOffset: (
    startOffset: number,
    endOffset: number,
    replacementText: string,
  ) => void;
  moveToOffset(offset: number): void;

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
