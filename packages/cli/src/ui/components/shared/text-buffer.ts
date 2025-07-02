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
import { useState, useCallback, useEffect, useMemo } from 'react';
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

export function useTextBuffer({
  initialText = '',
  initialCursorOffset = 0,
  viewport,
  stdin,
  setRawMode,
  onChange,
  isValidPath,
}: UseTextBufferProps): TextBuffer {
  const [lines, setLines] = useState<string[]>(() => {
    const l = initialText.split('\n');
    return l.length === 0 ? [''] : l;
  });

  const [[initialCursorRow, initialCursorCol]] = useState(() =>
    calculateInitialCursorPosition(lines, initialCursorOffset),
  );

  const [cursorRow, setCursorRow] = useState<number>(initialCursorRow);
  const [cursorCol, setCursorCol] = useState<number>(initialCursorCol);
  const [preferredCol, setPreferredCol] = useState<number | null>(null); // Visual preferred col

  const [undoStack, setUndoStack] = useState<UndoHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoHistoryEntry[]>([]);
  const historyLimit = 100;

  const [clipboard, setClipboard] = useState<string | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<
    [number, number] | null
  >(null); // Logical selection

  // Visual state
  const [visualLines, setVisualLines] = useState<string[]>(['']);
  const [visualCursor, setVisualCursor] = useState<[number, number]>([0, 0]);
  const [visualScrollRow, setVisualScrollRow] = useState<number>(0);
  const [logicalToVisualMap, setLogicalToVisualMap] = useState<
    Array<Array<[number, number]>>
  >([]);
  const [visualToLogicalMap, setVisualToLogicalMap] = useState<
    Array<[number, number]>
  >([]);

  const currentLine = useCallback(
    (r: number): string => lines[r] ?? '',
    [lines],
  );
  const currentLineLen = useCallback(
    (r: number): number => cpLen(currentLine(r)),
    [currentLine],
  );

  // Recalculate visual layout whenever logical lines or viewport width changes
  useEffect(() => {
    const layout = calculateVisualLayout(
      lines,
      [cursorRow, cursorCol],
      viewport.width,
    );
    setVisualLines(layout.visualLines);
    setVisualCursor(layout.visualCursor);
    setLogicalToVisualMap(layout.logicalToVisualMap);
    setVisualToLogicalMap(layout.visualToLogicalMap);
  }, [lines, cursorRow, cursorCol, viewport.width]);

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

  const pushUndo = useCallback(() => {
    dbg('pushUndo', { cursor: [cursorRow, cursorCol], text: lines.join('\n') });
    const snapshot = { lines: [...lines], cursorRow, cursorCol };
    setUndoStack((prev) => {
      const newStack = [...prev, snapshot];
      if (newStack.length > historyLimit) {
        newStack.shift();
      }
      return newStack;
    });
    setRedoStack([]);
  }, [lines, cursorRow, cursorCol, historyLimit]);

  const _restoreState = useCallback(
    (state: UndoHistoryEntry | undefined): boolean => {
      if (!state) return false;
      setLines(state.lines);
      setCursorRow(state.cursorRow);
      setCursorCol(state.cursorCol);
      return true;
    },
    [],
  );

  const text = lines.join('\n');

  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

  const undo = useCallback((): boolean => {
    const state = undoStack[undoStack.length - 1];
    if (!state) return false;

    setUndoStack((prev) => prev.slice(0, -1));
    const currentSnapshot = { lines: [...lines], cursorRow, cursorCol };
    setRedoStack((prev) => [...prev, currentSnapshot]);
    return _restoreState(state);
  }, [undoStack, lines, cursorRow, cursorCol, _restoreState]);

  const redo = useCallback((): boolean => {
    const state = redoStack[redoStack.length - 1];
    if (!state) return false;

    setRedoStack((prev) => prev.slice(0, -1));
    const currentSnapshot = { lines: [...lines], cursorRow, cursorCol };
    setUndoStack((prev) => [...prev, currentSnapshot]);
    return _restoreState(state);
  }, [redoStack, lines, cursorRow, cursorCol, _restoreState]);

  const insertStr = useCallback(
    (str: string): boolean => {
      dbg('insertStr', { str, beforeCursor: [cursorRow, cursorCol] });
      if (str === '') return false;

      pushUndo();
      let normalised = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      normalised = stripUnsafeCharacters(normalised);

      const parts = normalised.split('\n');

      const newLines = [...lines];
      const lineContent = currentLine(cursorRow);
      const before = cpSlice(lineContent, 0, cursorCol);
      const after = cpSlice(lineContent, cursorCol);
      newLines[cursorRow] = before + parts[0];

      if (parts.length > 1) {
        // Adjusted condition for inserting multiple lines
        const remainingParts = parts.slice(1);
        const lastPartOriginal = remainingParts.pop() ?? '';
        newLines.splice(cursorRow + 1, 0, ...remainingParts);
        newLines.splice(
          cursorRow + parts.length - 1,
          0,
          lastPartOriginal + after,
        );
        setCursorRow(cursorRow + parts.length - 1);
        setCursorCol(cpLen(lastPartOriginal));
      } else {
        setCursorCol(cpLen(before) + cpLen(parts[0]));
      }
      setLines(newLines);
      setPreferredCol(null);
      return true;
    },
    [pushUndo, cursorRow, cursorCol, lines, currentLine, setPreferredCol],
  );

  const applyOperations = useCallback(
    (ops: UpdateOperation[]) => {
      if (ops.length === 0) return;

      const expandedOps: UpdateOperation[] = [];
      for (const op of ops) {
        if (op.type === 'insert') {
          let currentText = '';
          for (const char of toCodePoints(op.payload)) {
            if (char.codePointAt(0) === 127) {
              // \x7f
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

      if (expandedOps.length === 0) {
        return;
      }

      pushUndo(); // Snapshot before applying batch of updates

      const newLines = [...lines];
      let newCursorRow = cursorRow;
      let newCursorCol = cursorCol;

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

      setLines(newLines);
      setCursorRow(newCursorRow);
      setCursorCol(newCursorCol);
      setPreferredCol(null);
    },
    [lines, cursorRow, cursorCol, pushUndo, setPreferredCol],
  );

  const insert = useCallback(
    (ch: string): void => {
      if (/[\n\r]/.test(ch)) {
        insertStr(ch);
        return;
      }
      dbg('insert', { ch, beforeCursor: [cursorRow, cursorCol] });

      ch = stripUnsafeCharacters(ch);

      // Arbitrary threshold to avoid false positives on normal key presses
      // while still detecting virtually all reasonable length file paths.
      const minLengthToInferAsDragDrop = 3;
      if (ch.length >= minLengthToInferAsDragDrop) {
        // Possible drag and drop of a file path.
        let potentialPath = ch;
        if (
          potentialPath.length > 2 &&
          potentialPath.startsWith("'") &&
          potentialPath.endsWith("'")
        ) {
          potentialPath = ch.slice(1, -1);
        }

        potentialPath = potentialPath.trim();
        // Be conservative and only add an @ if the path is valid.
        if (isValidPath(unescapePath(potentialPath))) {
          ch = `@${potentialPath}`;
        }
      }
      applyOperations([{ type: 'insert', payload: ch }]);
    },
    [applyOperations, cursorRow, cursorCol, isValidPath, insertStr],
  );

  const newline = useCallback((): void => {
    dbg('newline', { beforeCursor: [cursorRow, cursorCol] });
    applyOperations([{ type: 'insert', payload: '\n' }]);
  }, [applyOperations, cursorRow, cursorCol]);

  const backspace = useCallback((): void => {
    dbg('backspace', { beforeCursor: [cursorRow, cursorCol] });
    if (cursorCol === 0 && cursorRow === 0) return;
    applyOperations([{ type: 'backspace' }]);
  }, [applyOperations, cursorRow, cursorCol]);

  const del = useCallback((): void => {
    dbg('delete', { beforeCursor: [cursorRow, cursorCol] });
    const lineContent = currentLine(cursorRow);
    if (cursorCol < currentLineLen(cursorRow)) {
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          cpSlice(lineContent, cursorCol + 1);
        return newLines;
      });
    } else if (cursorRow < lines.length - 1) {
      pushUndo();
      const nextLineContent = currentLine(cursorRow + 1);
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return newLines;
      });
    }
    // cursor position does not change for del
    setPreferredCol(null);
  }, [
    pushUndo,
    cursorRow,
    cursorCol,
    currentLine,
    currentLineLen,
    lines.length,
    setPreferredCol,
  ]);

  const setText = useCallback(
    (newText: string): void => {
      dbg('setText', { text: newText });
      pushUndo();
      const newContentLines = newText.replace(/\r\n?/g, '\n').split('\n');
      setLines(newContentLines.length === 0 ? [''] : newContentLines);
      // Set logical cursor to the end of the new text
      const lastNewLineIndex = newContentLines.length - 1;
      setCursorRow(lastNewLineIndex);
      setCursorCol(cpLen(newContentLines[lastNewLineIndex] ?? ''));
      setPreferredCol(null);
    },
    [pushUndo, setPreferredCol],
  );

  const replaceRange = useCallback(
    (
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      replacementText: string,
    ): boolean => {
      if (
        startRow > endRow ||
        (startRow === endRow && startCol > endCol) ||
        startRow < 0 ||
        startCol < 0 ||
        endRow >= lines.length ||
        (endRow < lines.length && endCol > currentLineLen(endRow))
      ) {
        console.error('Invalid range provided to replaceRange', {
          startRow,
          startCol,
          endRow,
          endCol,
          linesLength: lines.length,
          endRowLineLength: currentLineLen(endRow),
        });
        return false;
      }
      dbg('replaceRange', {
        start: [startRow, startCol],
        end: [endRow, endCol],
        text: replacementText,
      });
      pushUndo();

      const sCol = clamp(startCol, 0, currentLineLen(startRow));
      const eCol = clamp(endCol, 0, currentLineLen(endRow));

      const prefix = cpSlice(currentLine(startRow), 0, sCol);
      const suffix = cpSlice(currentLine(endRow), eCol);
      const normalisedReplacement = replacementText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      const replacementParts = normalisedReplacement.split('\n');

      setLines((prevLines) => {
        const newLines = [...prevLines];
        // Remove lines between startRow and endRow (exclusive of startRow, inclusive of endRow if different)
        if (startRow < endRow) {
          newLines.splice(startRow + 1, endRow - startRow);
        }

        // Construct the new content for the startRow
        newLines[startRow] = prefix + replacementParts[0];

        // If replacementText has multiple lines, insert them
        if (replacementParts.length > 1) {
          const lastReplacementPart = replacementParts.pop() ?? ''; // parts are already split by \n
          // Insert middle parts (if any)
          if (replacementParts.length > 1) {
            // parts[0] is already used
            newLines.splice(startRow + 1, 0, ...replacementParts.slice(1));
          }

          // The line where the last part of the replacement will go
          const targetRowForLastPart = startRow + (replacementParts.length - 1); // -1 because parts[0] is on startRow
          // If the last part is not the first part (multi-line replacement)
          if (
            targetRowForLastPart > startRow ||
            (replacementParts.length === 1 && lastReplacementPart !== '')
          ) {
            // If the target row for the last part doesn't exist (because it's a new line created by replacement)
            // ensure it's created before trying to append suffix.
            // This case should be handled by splice if replacementParts.length > 1
            // For single line replacement that becomes multi-line due to parts.length > 1 logic, this is tricky.
            // Let's assume newLines[targetRowForLastPart] exists due to previous splice or it's newLines[startRow]
            if (
              newLines[targetRowForLastPart] === undefined &&
              targetRowForLastPart === startRow + 1 &&
              replacementParts.length === 1
            ) {
              // This implies a single line replacement that became two lines.
              // e.g. "abc" replace "b" with "B\nC" -> "aB", "C", "c"
              // Here, lastReplacementPart is "C", targetRowForLastPart is startRow + 1
              newLines.splice(
                targetRowForLastPart,
                0,
                lastReplacementPart + suffix,
              );
            } else {
              newLines[targetRowForLastPart] =
                (newLines[targetRowForLastPart] || '') +
                lastReplacementPart +
                suffix;
            }
          } else {
            // Single line in replacementParts, but it was the only part
            newLines[startRow] += suffix;
          }

          setCursorRow(targetRowForLastPart);
          setCursorCol(cpLen(newLines[targetRowForLastPart]) - cpLen(suffix));
        } else {
          // Single line replacement (replacementParts has only one item)
          newLines[startRow] += suffix;
          setCursorRow(startRow);
          setCursorCol(cpLen(prefix) + cpLen(replacementParts[0]));
        }
        return newLines;
      });

      setPreferredCol(null);
      return true;
    },
    [pushUndo, lines, currentLine, currentLineLen, setPreferredCol],
  );

  const deleteWordLeft = useCallback((): void => {
    dbg('deleteWordLeft', { beforeCursor: [cursorRow, cursorCol] });
    if (cursorCol === 0 && cursorRow === 0) return;
    if (cursorCol === 0) {
      backspace();
      return;
    }
    pushUndo();
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
    setLines((prevLines) => {
      const newLines = [...prevLines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, start) + cpSlice(lineContent, cursorCol);
      return newLines;
    });
    setCursorCol(start);
    setPreferredCol(null);
  }, [pushUndo, cursorRow, cursorCol, currentLine, backspace, setPreferredCol]);

  const deleteWordRight = useCallback((): void => {
    dbg('deleteWordRight', { beforeCursor: [cursorRow, cursorCol] });
    const lineContent = currentLine(cursorRow);
    const arr = toCodePoints(lineContent);
    if (cursorCol >= arr.length && cursorRow === lines.length - 1) return;
    if (cursorCol >= arr.length) {
      del();
      return;
    }
    pushUndo();
    let end = cursorCol;
    while (end < arr.length && !isWordChar(arr[end])) end++;
    while (end < arr.length && isWordChar(arr[end])) end++;
    setLines((prevLines) => {
      const newLines = [...prevLines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, cursorCol) + cpSlice(lineContent, end);
      return newLines;
    });
    setPreferredCol(null);
  }, [
    pushUndo,
    cursorRow,
    cursorCol,
    currentLine,
    del,
    lines.length,
    setPreferredCol,
  ]);

  const killLineRight = useCallback((): void => {
    const lineContent = currentLine(cursorRow);
    if (cursorCol < currentLineLen(cursorRow)) {
      // Cursor is before the end of the line's content, delete text to the right
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = cpSlice(lineContent, 0, cursorCol);
        return newLines;
      });
      // Cursor position and preferredCol do not change in this case
    } else if (
      cursorCol === currentLineLen(cursorRow) &&
      cursorRow < lines.length - 1
    ) {
      // Cursor is at the end of the line's content (or line is empty),
      // and it's not the last line. Delete the newline.
      // `del()` handles pushUndo and setPreferredCol.
      del();
    }
    // If cursor is at the end of the line and it's the last line, do nothing.
  }, [
    pushUndo,
    cursorRow,
    cursorCol,
    currentLine,
    currentLineLen,
    lines.length,
    del,
  ]);

  const killLineLeft = useCallback((): void => {
    const lineContent = currentLine(cursorRow);
    // Only act if the cursor is not at the beginning of the line
    if (cursorCol > 0) {
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = cpSlice(lineContent, cursorCol);
        return newLines;
      });
      setCursorCol(0);
      setPreferredCol(null);
    }
  }, [pushUndo, cursorRow, cursorCol, currentLine, setPreferredCol]);

  const move = useCallback(
    (dir: Direction): void => {
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
        // wordLeft and wordRight might need more sophisticated visual handling
        // For now, they operate on the logical line derived from the visual cursor
        case 'wordLeft': {
          newPreferredCol = null;
          if (
            visualToLogicalMap.length === 0 ||
            logicalToVisualMap.length === 0
          )
            break;
          const [logRow, logColInitial] = visualToLogicalMap[newVisualRow] ?? [
            0, 0,
          ];
          const currentLogCol = logColInitial + newVisualCol;
          const lineText = lines[logRow];
          const sliceToCursor = cpSlice(lineText, 0, currentLogCol).replace(
            /[\s,.;!?]+$/,
            '',
          );
          let lastIdx = 0;
          const regex = /[\s,.;!?]+/g;
          let m;
          while ((m = regex.exec(sliceToCursor)) != null) lastIdx = m.index;
          const newLogicalCol =
            lastIdx === 0 ? 0 : cpLen(sliceToCursor.slice(0, lastIdx)) + 1;

          // Map newLogicalCol back to visual
          const targetLogicalMapEntries = logicalToVisualMap[logRow];
          if (!targetLogicalMapEntries) break;
          for (let i = targetLogicalMapEntries.length - 1; i >= 0; i--) {
            const [visRow, logStartCol] = targetLogicalMapEntries[i];
            if (newLogicalCol >= logStartCol) {
              newVisualRow = visRow;
              newVisualCol = newLogicalCol - logStartCol;
              break;
            }
          }
          break;
        }
        case 'wordRight': {
          newPreferredCol = null;
          if (
            visualToLogicalMap.length === 0 ||
            logicalToVisualMap.length === 0
          )
            break;
          const [logRow, logColInitial] = visualToLogicalMap[newVisualRow] ?? [
            0, 0,
          ];
          const currentLogCol = logColInitial + newVisualCol;
          const lineText = lines[logRow];
          const regex = /[\s,.;!?]+/g;
          let moved = false;
          let m;
          let newLogicalCol = currentLineLen(logRow); // Default to end of logical line

          while ((m = regex.exec(lineText)) != null) {
            const cpIdx = cpLen(lineText.slice(0, m.index));
            if (cpIdx > currentLogCol) {
              newLogicalCol = cpIdx;
              moved = true;
              break;
            }
          }
          if (!moved && currentLogCol < currentLineLen(logRow)) {
            // If no word break found after cursor, move to end
            newLogicalCol = currentLineLen(logRow);
          }

          // Map newLogicalCol back to visual
          const targetLogicalMapEntries = logicalToVisualMap[logRow];
          if (!targetLogicalMapEntries) break;
          for (let i = 0; i < targetLogicalMapEntries.length; i++) {
            const [visRow, logStartCol] = targetLogicalMapEntries[i];
            const nextLogStartCol =
              i + 1 < targetLogicalMapEntries.length
                ? targetLogicalMapEntries[i + 1][1]
                : Infinity;
            if (
              newLogicalCol >= logStartCol &&
              newLogicalCol < nextLogStartCol
            ) {
              newVisualRow = visRow;
              newVisualCol = newLogicalCol - logStartCol;
              break;
            }
            if (
              newLogicalCol === logStartCol &&
              i === targetLogicalMapEntries.length - 1 &&
              cpLen(visualLines[visRow] ?? '') === 0
            ) {
              // Special case: moving to an empty visual line at the end of a logical line
              newVisualRow = visRow;
              newVisualCol = 0;
              break;
            }
          }
          break;
        }
        default:
          break;
      }

      setVisualCursor([newVisualRow, newVisualCol]);
      setPreferredCol(newPreferredCol);

      // Update logical cursor based on new visual cursor
      if (visualToLogicalMap[newVisualRow]) {
        const [logRow, logStartCol] = visualToLogicalMap[newVisualRow];
        setCursorRow(logRow);
        setCursorCol(
          clamp(logStartCol + newVisualCol, 0, currentLineLen(logRow)),
        );
      }

      dbg('move', {
        dir,
        visualBefore: visualCursor,
        visualAfter: [newVisualRow, newVisualCol],
        logicalAfter: [cursorRow, cursorCol],
      });
    },
    [
      visualCursor,
      visualLines,
      preferredCol,
      lines,
      currentLineLen,
      visualToLogicalMap,
      logicalToVisualMap,
      cursorCol,
      cursorRow,
    ],
  );

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

      pushUndo(); // Snapshot before external edit

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
        setText(newText);
      } catch (err) {
        console.error('[useTextBuffer] external editor error', err);
        // TODO(jacobr): potentially revert or handle error state.
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
    [text, pushUndo, stdin, setRawMode, setText],
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
      dbg('handleInput', {
        key,
        cursor: [cursorRow, cursorCol],
        visualCursor,
      });
      const beforeText = text;
      const beforeLogicalCursor = [cursorRow, cursorCol];
      const beforeVisualCursor = [...visualCursor];

      if (key.name === 'escape') return false;

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
        insert(input);
      }

      const textChanged = text !== beforeText;
      // After operations, visualCursor might not be immediately updated if the change
      // was to `lines`, `cursorRow`, or `cursorCol` which then triggers the useEffect.
      // So, for return value, we check logical cursor change.
      const cursorChanged =
        cursorRow !== beforeLogicalCursor[0] ||
        cursorCol !== beforeLogicalCursor[1] ||
        visualCursor[0] !== beforeVisualCursor[0] ||
        visualCursor[1] !== beforeVisualCursor[1];

      dbg('handleInput:after', {
        cursor: [cursorRow, cursorCol],
        visualCursor,
        text,
      });
      return textChanged || cursorChanged;
    },
    [
      text,
      cursorRow,
      cursorCol,
      visualCursor,
      newline,
      move,
      deleteWordLeft,
      deleteWordRight,
      backspace,
      del,
      insert,
    ],
  );

  const renderedVisualLines = useMemo(
    () => visualLines.slice(visualScrollRow, visualScrollRow + viewport.height),
    [visualLines, visualScrollRow, viewport.height],
  );

  const replaceRangeByOffset = useCallback(
    (
      startOffset: number,
      endOffset: number,
      replacementText: string,
    ): boolean => {
      dbg('replaceRangeByOffset', { startOffset, endOffset, replacementText });
      const [startRow, startCol] = offsetToLogicalPos(text, startOffset);
      const [endRow, endCol] = offsetToLogicalPos(text, endOffset);
      return replaceRange(startRow, startCol, endRow, endCol, replacementText);
    },
    [text, replaceRange],
  );

  const moveToOffset = useCallback(
    (offset: number): void => {
      const [newRow, newCol] = offsetToLogicalPos(text, offset);
      setCursorRow(newRow);
      setCursorCol(newCol);
      setPreferredCol(null);
      dbg('moveToOffset', { offset, newCursor: [newRow, newCol] });
    },
    [text, setPreferredCol],
  );

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
    moveToOffset, // Added here
    deleteWordLeft,
    deleteWordRight,
    killLineRight,
    killLineLeft,
    handleInput,
    openInExternalEditor,

    applyOperations,

    copy: useCallback(() => {
      if (!selectionAnchor) return null;
      const [ar, ac] = selectionAnchor;
      const [br, bc] = [cursorRow, cursorCol];
      if (ar === br && ac === bc) return null;
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
      setClipboard(selectedTextVal);
      return selectedTextVal;
    }, [selectionAnchor, cursorRow, cursorCol, currentLine, setClipboard]),
    paste: useCallback(() => {
      if (clipboard === null) return false;
      return insertStr(clipboard);
    }, [clipboard, insertStr]),
    startSelection: useCallback(
      () => setSelectionAnchor([cursorRow, cursorCol]),
      [cursorRow, cursorCol, setSelectionAnchor],
    ),
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
