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

export type Direction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wordLeft'
  | 'wordRight'
  | 'home'
  | 'end';

// TODO(jacob314): refactor so all edit operations to be part of this list.
// This makes it robust for clients to apply multiple edit operations without
// having to carefully reason about how React manages state.
type UpdateOperation =
  | { type: 'insert'; payload: string }
  | { type: 'backspace' };

// Simple helper for word‑wise ops.
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) {
    return false;
  }
  return !/[\s,.;!?]/.test(ch);
}

/**
 * Strip characters that can break terminal rendering.
 *
 * Strip ANSI escape codes and control characters except for line breaks.
 * Control characters such as delete break terminal UI rendering.
 */
function stripUnsafeCharacters(str: string): string {
  const stripped = stripAnsi(str);
  return toCodePoints(stripAnsi(stripped))
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

/* -------------------------------------------------------------------------
 *  Debug helper – enable verbose logging by setting env var TEXTBUFFER_DEBUG=1
 * ---------------------------------------------------------------------- */

// Enable verbose logging only when requested via env var.
const DEBUG =
  process.env['TEXTBUFFER_DEBUG'] === '1' ||
  process.env['TEXTBUFFER_DEBUG'] === 'true';

function dbg(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[TextBuffer]', ...args);
  }
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

interface TextBufferState {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  preferredCol: number | null; // This is visual preferred col
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];
  clipboard: string | null;
  selectionAnchor: [number, number] | null;
}

const historyLimit = 100;

type TextBufferAction =
  | { type: 'SET_TEXT'; payload: string; pushToUndo?: boolean }
  | { type: 'APPLY_OPERATIONS'; payload: UpdateOperation[] }
  | {
      type: 'MOVE';
      payload: {
        dir: Direction;
        visualLayout: ReturnType<typeof calculateVisualLayout>;
      };
    }
  | { type: 'DELETE' }
  | { type: 'DELETE_WORD_LEFT' }
  | { type: 'DELETE_WORD_RIGHT' }
  | { type: 'KILL_LINE_RIGHT' }
  | { type: 'KILL_LINE_LEFT' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | {
      type: 'REPLACE_RANGE';
      payload: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
        text: string;
      };
    }
  | { type: 'MOVE_TO_OFFSET'; payload: { text: string; offset: number } }
  | { type: 'COPY' }
  | { type: 'PASTE' }
  | { type: 'START_SELECTION' };

function textBufferReducer(
  state: TextBufferState,
  action: TextBufferAction,
): TextBufferState {
  const pushUndo = (currentState: TextBufferState): TextBufferState => {
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

  const currentLine = (r: number): string => state.lines[r] ?? '';
  const currentLineLen = (r: number): number => cpLen(currentLine(r));

  switch (action.type) {
    case 'SET_TEXT': {
      dbg('setText', { text: action.payload });
      let nextState = state;
      if (action.pushToUndo !== false) {
        nextState = pushUndo(state);
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

    case 'APPLY_OPERATIONS': {
      if (action.payload.length === 0) return state;

      const expandedOps: UpdateOperation[] = [];
      for (const op of action.payload) {
        if (op.type === 'insert') {
          let currentText = '';
          for (const char of toCodePoints(op.payload)) {
            if (char.codePointAt(0) === 127) {
              if (currentText.length > 0) {
                expandedOps.push({ type: 'insert', payload: currentText });
                currentText = '';
              }
              expandedOps.push({ type: 'backspace' });
            } else {
              currentText += char;
            }
          }
          if (currentText.length > 0) {
            expandedOps.push({ type: 'insert', payload: currentText });
          }
        } else {
          expandedOps.push(op);
        }
      }

      if (expandedOps.length === 0) return state;

      const nextState = pushUndo(state);
      const newLines = [...nextState.lines];
      let newCursorRow = nextState.cursorRow;
      let newCursorCol = nextState.cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      for (const op of expandedOps) {
        if (op.type === 'insert') {
          const str = stripUnsafeCharacters(
            op.payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
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
        } else if (op.type === 'backspace') {
          if (newCursorCol === 0 && newCursorRow === 0) continue;

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
            newLines[newCursorRow - 1] =
              prevLineContent + currentLineContentVal;
            newLines.splice(newCursorRow, 1);
            newCursorRow--;
            newCursorCol = newCol;
          }
        }
      }

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
      };
    }

    case 'MOVE': {
      const { dir, visualLayout } = action.payload;
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
        // wordLeft and wordRight are complex and better handled by dispatching from the component
        // This reducer logic is simplified. For full fidelity, it would need more context.
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

    case 'DELETE': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = pushUndo(state);
        const newLines = [...nextState.lines];
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          cpSlice(lineContent, cursorCol + 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      } else if (cursorRow < lines.length - 1) {
        const nextState = pushUndo(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      return state;
    }

    case 'DELETE_WORD_LEFT': {
      const { cursorRow, cursorCol } = state;
      if (cursorCol === 0 && cursorRow === 0) return state;
      if (cursorCol === 0) {
        // Act as a backspace
        const nextState = pushUndo(state);
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
      const nextState = pushUndo(state);
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

    case 'DELETE_WORD_RIGHT': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      const arr = toCodePoints(lineContent);
      if (cursorCol >= arr.length && cursorRow === lines.length - 1)
        return state;
      if (cursorCol >= arr.length) {
        // Act as a delete
        const nextState = pushUndo(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      const nextState = pushUndo(state);
      let end = cursorCol;
      while (end < arr.length && !isWordChar(arr[end])) end++;
      while (end < arr.length && isWordChar(arr[end])) end++;
      const newLines = [...nextState.lines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, cursorCol) + cpSlice(lineContent, end);
      return { ...nextState, lines: newLines, preferredCol: null };
    }

    case 'KILL_LINE_RIGHT': {
      const { cursorRow, cursorCol, lines } = state;
      const lineContent = currentLine(cursorRow);
      if (cursorCol < currentLineLen(cursorRow)) {
        const nextState = pushUndo(state);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = cpSlice(lineContent, 0, cursorCol);
        return { ...nextState, lines: newLines };
      } else if (cursorRow < lines.length - 1) {
        // Act as a delete
        const nextState = pushUndo(state);
        const nextLineContent = currentLine(cursorRow + 1);
        const newLines = [...nextState.lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return { ...nextState, lines: newLines, preferredCol: null };
      }
      return state;
    }

    case 'KILL_LINE_LEFT': {
      const { cursorRow, cursorCol } = state;
      if (cursorCol > 0) {
        const nextState = pushUndo(state);
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

    case 'UNDO': {
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

    case 'REDO': {
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

    case 'PASTE': {
      if (state.clipboard === null) return state;
      // This can be implemented by dispatching APPLY_OPERATIONS
      // For simplicity here, we'll just do a simple insert.
      // A more robust solution would reuse the APPLY_OPERATIONS logic.
      const nextState = pushUndo(state);
      const { cursorRow, cursorCol } = nextState;
      const lineContent = nextState.lines[cursorRow];
      const before = cpSlice(lineContent, 0, cursorCol);
      const after = cpSlice(lineContent, cursorCol);
      const newLines = [...nextState.lines];
      newLines[cursorRow] = before + state.clipboard + after;
      return {
        ...nextState,
        lines: newLines,
        cursorCol: cursorCol + cpLen(state.clipboard),
        preferredCol: null,
      };
    }

    case 'REPLACE_RANGE': {
      const { startRow, startCol, endRow, endCol, text } = action.payload;
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

      const nextState = pushUndo(state);
      const newLines = [...nextState.lines];

      const sCol = clamp(startCol, 0, currentLineLen(startRow));
      const eCol = clamp(endCol, 0, currentLineLen(endRow));

      const prefix = cpSlice(currentLine(startRow), 0, sCol);
      const suffix = cpSlice(currentLine(endRow), eCol);

      const normalisedReplacement = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      const replacementParts = normalisedReplacement.split('\n');

      // Replace the content
      if (startRow === endRow) {
        newLines[startRow] = prefix + normalisedReplacement + suffix;
      } else {
        newLines.splice(
          startRow,
          endRow - startRow + 1,
          prefix + replacementParts[0] + suffix,
        );
      }

      const finalCursorRow = startRow + replacementParts.length - 1;
      const finalCursorCol =
        (replacementParts.length > 1 ? 0 : sCol) +
        cpLen(replacementParts[replacementParts.length - 1]);

      return {
        ...nextState,
        lines: newLines,
        cursorRow: finalCursorRow,
        cursorCol: finalCursorCol,
        preferredCol: null,
      };
    }

    case 'MOVE_TO_OFFSET': {
      const { text, offset } = action.payload;
      const [newRow, newCol] = offsetToLogicalPos(text, offset);
      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'COPY': {
      if (!state.selectionAnchor) return state;
      const [ar, ac] = state.selectionAnchor;
      const [br, bc] = [state.cursorRow, state.cursorCol];
      if (ar === br && ac === bc) return state;
      const topBefore = ar < br || (ar === br && ac < bc);
      const [sr, sc, er, ec] = topBefore ? [ar, ac, br, bc] : [br, bc, ar, ac];

      let selectedTextVal;
      if (sr === er) {
        selectedTextVal = cpSlice(currentLine(sr), sc, ec);
      } else {
        const parts: string[] = [cpSlice(currentLine(sr), sc)];
        for (let r = sr + 1; r < er; r++) parts.push(currentLine(r));
        parts.push(cpSlice(currentLine(er), 0, ec));
        selectedTextVal = parts.join('\n');
      }
      return { ...state, clipboard: selectedTextVal };
    }

    case 'START_SELECTION': {
      return {
        ...state,
        selectionAnchor: [state.cursorRow, state.cursorCol],
      };
    }

    // Other actions like DELETE_WORD_LEFT, REPLACE_RANGE etc. would be implemented here.
    // For brevity, they are omitted but would follow a similar pattern of taking state,
    // performing operations on copies, and returning a new state object.
    default:
      return state;
  }

  return state;
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
    };
  }, [initialText, initialCursorOffset]);

  const [state, dispatch] = useReducer(textBufferReducer, initialState);
  const { lines, cursorRow, cursorCol, preferredCol, selectionAnchor } = state;

  const text = useMemo(() => lines.join('\n'), [lines]);

  const visualLayout = useMemo(
    () => calculateVisualLayout(lines, [cursorRow, cursorCol], viewport.width),
    [lines, cursorRow, cursorCol, viewport.width],
  );

  const { visualLines, visualCursor } = visualLayout;

  const [visualScrollRow, setVisualScrollRow] = useState<number>(0);

  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

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

  const applyOperations = useCallback((ops: UpdateOperation[]) => {
    dispatch({ type: 'APPLY_OPERATIONS', payload: ops });
  }, []);

  const insert = useCallback(
    (ch: string): void => {
      if (/[\n\r]/.test(ch)) {
        applyOperations([{ type: 'insert', payload: ch }]);
        return;
      }
      dbg('insert', { ch, beforeCursor: [cursorRow, cursorCol] });

      ch = stripUnsafeCharacters(ch);

      const minLengthToInferAsDragDrop = 3;
      if (ch.length >= minLengthToInferAsDragDrop) {
        let potentialPath = ch;
        if (
          potentialPath.length > 2 &&
          potentialPath.startsWith("'") &&
          potentialPath.endsWith("'")
        ) {
          potentialPath = ch.slice(1, -1);
        }

        potentialPath = potentialPath.trim();
        if (isValidPath(unescapePath(potentialPath))) {
          ch = `@${potentialPath}`;
        }
      }
      applyOperations([{ type: 'insert', payload: ch }]);
    },
    [applyOperations, cursorRow, cursorCol, isValidPath],
  );

  const newline = useCallback((): void => {
    applyOperations([{ type: 'insert', payload: '\n' }]);
  }, [applyOperations]);

  const backspace = useCallback((): void => {
    if (cursorCol === 0 && cursorRow === 0) return;
    applyOperations([{ type: 'backspace' }]);
  }, [applyOperations, cursorRow, cursorCol]);

  const del = useCallback((): void => {
    dispatch({ type: 'DELETE' });
  }, []);

  const move = useCallback(
    (dir: Direction): void => {
      // Complex moves like wordLeft/wordRight are not yet in reducer
      // and would need more complex logic there.
      // This is a simplified dispatch.
      dispatch({ type: 'MOVE', payload: { dir, visualLayout } });
    },
    [visualLayout],
  );

  const undo = useCallback((): boolean => {
    dispatch({ type: 'UNDO' });
    return state.undoStack.length > 0;
  }, [state.undoStack.length]);

  const redo = useCallback((): boolean => {
    dispatch({ type: 'REDO' });
    return state.redoStack.length > 0;
  }, [state.redoStack.length]);

  const setText = useCallback((newText: string): void => {
    dispatch({ type: 'SET_TEXT', payload: newText });
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

      dispatch({ type: 'SET_TEXT', payload: text, pushToUndo: true });

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
        dispatch({ type: 'SET_TEXT', payload: newText, pushToUndo: false });
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
    }): boolean => {
      const { sequence: input } = key;
      const beforeText = text;
      const beforeCursor = [cursorRow, cursorCol];

      if (key.name === 'escape') return false;

      if (key.name === 'return' || input === '\r' || input === '\n') {
        newline();
      } else if (key.name === 'left' && !key.meta && !key.ctrl) {
        move('left');
      } else if (key.name === 'right' && !key.meta && !key.ctrl) {
        move('right');
      } else if (key.name === 'up') {
        move('up');
      } else if (key.name === 'down') {
        move('down');
      } else if (key.name === 'home') {
        move('home');
      } else if (key.name === 'end') {
        move('end');
      } else if (key.name === 'backspace' || input === '\x7f') {
        backspace();
      } else if (key.name === 'delete' || (key.ctrl && key.name === 'd')) {
        del();
      } else if (input && !key.ctrl && !key.meta) {
        insert(input);
      }

      const textChanged = text !== beforeText;
      const cursorChanged =
        cursorRow !== beforeCursor[0] || cursorCol !== beforeCursor[1];

      return textChanged || cursorChanged;
    },
    [text, cursorRow, cursorCol, newline, move, backspace, del, insert],
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
    ): boolean => {
      if (
        startRow > endRow ||
        (startRow === endRow && startCol > endCol) ||
        startRow < 0 ||
        startCol < 0 ||
        endRow >= lines.length ||
        (endRow < lines.length && endCol > cpLen(lines[endRow]))
      ) {
        return false;
      }
      dispatch({
        type: 'REPLACE_RANGE',
        payload: { startRow, startCol, endRow, endCol, text },
      });
      // This is a simplified return value. A more robust implementation
      // might check if the state was actually changed.
      return true;
    },
    [lines],
  );

  const replaceRangeByOffset = useCallback(
    (
      startOffset: number,
      endOffset: number,
      replacementText: string,
    ): boolean => {
      const [startRow, startCol] = offsetToLogicalPos(text, startOffset);
      const [endRow, endCol] = offsetToLogicalPos(text, endOffset);
      return replaceRange(startRow, startCol, endRow, endCol, replacementText);
    },
    [text, replaceRange],
  );

  const moveToOffset = useCallback(
    (offset: number): void => {
      dispatch({ type: 'MOVE_TO_OFFSET', payload: { text, offset } });
    },
    [text],
  );

  // The rest of the functions are not fully ported to the reducer in this example
  // for brevity, but would follow the same pattern of dispatching actions.
  const deleteWordLeft = useCallback((): void => {
    dispatch({ type: 'DELETE_WORD_LEFT' });
  }, []);

  const deleteWordRight = useCallback((): void => {
    dispatch({ type: 'DELETE_WORD_RIGHT' });
  }, []);

  const killLineRight = useCallback((): void => {
    dispatch({ type: 'KILL_LINE_RIGHT' });
  }, []);

  const killLineLeft = useCallback((): void => {
    dispatch({ type: 'KILL_LINE_LEFT' });
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

    applyOperations,

    copy: useCallback(() => {
      dispatch({ type: 'COPY' });
      return state.clipboard;
    }, [state.clipboard]),
    paste: useCallback(() => {
      dispatch({ type: 'PASTE' });
      return state.clipboard !== null;
    }, [state.clipboard]),
    startSelection: useCallback(() => {
      dispatch({ type: 'START_SELECTION' });
    }, []),
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
  insert: (ch: string) => void;
  newline: () => void;
  backspace: () => void;
  del: () => void;
  move: (dir: Direction) => void;
  undo: () => boolean;
  redo: () => boolean;
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
  ) => boolean;
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
  }) => boolean;
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

  // Selection & Clipboard
  copy: () => string | null;
  paste: () => boolean;
  startSelection: () => void;
  replaceRangeByOffset: (
    startOffset: number,
    endOffset: number,
    replacementText: string,
  ) => boolean;
  moveToOffset(offset: number): void;

  // Batch updates
  applyOperations: (ops: UpdateOperation[]) => void;
}
