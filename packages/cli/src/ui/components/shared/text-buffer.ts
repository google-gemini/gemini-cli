/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as pathMod from 'path';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { unescapePath } from '@google/gemini-cli-core';
import { toCodePoints, cpLen, cpSlice } from '../../utils/textUtils.js';
import { movementFunctions, MovementContext } from './movement-functions.js';
import {
  isWordChar,
  stripUnsafeCharacters,
  clamp,
  dbg,
  calculateInitialCursorPosition,
  offsetToLogicalPos,
  calculateVisualLayout,
} from '../../utils/text-buffer-utils.js';
import {
  normalizeKey,
  keyBindingResolver,
  type EditorContext,
} from './key-bindings.js';

/* ──────────────────────────────────────────────────────────────────────── */
/*                              CONSTANTS                                      */
/* ──────────────────────────────────────────────────────────────────────── */

// ASCII Character Codes
const ASCII_CODES = {
  /** ASCII DELETE character (0x7F) - breaks terminal rendering */
  DELETE: 127,
  /** ASCII control character boundary - characters below this are control characters */
  CONTROL_CHAR_BOUNDARY: 31,
  /** ASCII Line Feed character (\n) */
  LINE_FEED: 10,
  /** ASCII Carriage Return character (\r) */
  CARRIAGE_RETURN: 13,
} as const;

// Buffer Management Constants
const BUFFER_LIMITS = {
  /** Maximum number of undo/redo history entries to retain */
  HISTORY_LIMIT: 100,
} as const;

// Text Processing Constants
const TEXT_PROCESSING = {
  /** Minimum string length to consider for drag-and-drop file path detection */
  MIN_DRAG_DROP_PATH_LENGTH: 3,
  /** Minimum quote-wrapped path length for path extraction */
  MIN_QUOTED_PATH_LENGTH: 2,
} as const;

// Common Array/Index Constants
const INDICES = {
  /** Index for first element or start position */
  START: 0,
  /** Single step increment/decrement */
  SINGLE_STEP: 1,
  /** Indicator for "not found" or "previous" position */
  NOT_FOUND: -1,
} as const;

// String Processing Constants
const STRING_PROCESSING = {
  /** Index offset for removing first character from string */
  REMOVE_FIRST_CHAR: 1,
  /** Index offset for removing last character from string */
  REMOVE_LAST_CHAR: -1,
} as const;

// Visual Layout Constants
const VISUAL_CONSTANTS = {
  /** Initial visual cursor row */
  INITIAL_CURSOR_ROW: 0,
  /** Initial visual cursor column */
  INITIAL_CURSOR_COL: 0,
} as const;

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

/**
 * Normalizes text by converting various line ending formats to \n and stripping unsafe characters.
 * This ensures consistent text handling across different platforms and input sources.
 */
function normalizeText(str: string): string {
  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return stripUnsafeCharacters(normalized);
}

/**
 * Result of text insertion operation containing new lines and cursor position.
 */
interface TextInsertionResult {
  newLines: string[];
  newCursorRow: number;
  newCursorCol: number;
}

/**
 * Inserts text at a specific cursor position within a lines array.
 * Handles both single-line and multi-line insertions with proper cursor positioning.
 *
 * @param lines - Array of text lines to modify
 * @param cursorRow - Current cursor row position
 * @param cursorCol - Current cursor column position
 * @param text - Text to insert (should already be normalized)
 * @returns Result object with new lines array and cursor position
 */
function insertTextAtCursor(
  lines: string[],
  cursorRow: number,
  cursorCol: number,
  text: string,
): TextInsertionResult {
  const parts = text.split('\n');
  const newLines = [...lines];

  const lineContent = newLines[cursorRow] ?? '';
  const before = cpSlice(lineContent, INDICES.START, cursorCol);
  const after = cpSlice(lineContent, cursorCol);

  if (parts.length > INDICES.SINGLE_STEP) {
    // Multi-line insertion
    newLines[cursorRow] = before + parts[INDICES.START];
    const remainingParts = parts.slice(INDICES.SINGLE_STEP);
    const lastPartOriginal = remainingParts.pop() ?? '';
    newLines.splice(
      cursorRow + INDICES.SINGLE_STEP,
      INDICES.START,
      ...remainingParts,
    );
    newLines.splice(
      cursorRow + parts.length - INDICES.SINGLE_STEP,
      INDICES.START,
      lastPartOriginal + after,
    );

    return {
      newLines,
      newCursorRow: cursorRow + parts.length - INDICES.SINGLE_STEP,
      newCursorCol: cpLen(lastPartOriginal),
    };
  } else {
    // Single-line insertion
    newLines[cursorRow] = before + parts[INDICES.START] + after;

    return {
      newLines,
      newCursorRow: cursorRow,
      newCursorCol: cpLen(before) + cpLen(parts[INDICES.START]),
    };
  }
}

export interface Viewport {
  height: number;
  width: number;
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

export { offsetToLogicalPos } from '../../utils/text-buffer-utils.js';

export function useTextBuffer({
  initialText = '',
  initialCursorOffset = INDICES.START,
  viewport,
  stdin,
  setRawMode,
  onChange,
  isValidPath,
}: UseTextBufferProps): TextBuffer {
  const [lines, setLines] = useState<string[]>(() => {
    const l = initialText.split('\n');
    return l.length === INDICES.START ? [''] : l;
  });

  const [[initialCursorRow, initialCursorCol]] = useState(() =>
    calculateInitialCursorPosition(lines, initialCursorOffset),
  );

  const [cursorRow, setCursorRow] = useState<number>(initialCursorRow);
  const [cursorCol, setCursorCol] = useState<number>(initialCursorCol);
  const [preferredCol, setPreferredCol] = useState<number | null>(null); // Visual preferred col

  const [undoStack, setUndoStack] = useState<UndoHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoHistoryEntry[]>([]);
  const historyLimit = BUFFER_LIMITS.HISTORY_LIMIT;

  const [clipboard, setClipboard] = useState<string | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<
    [number, number] | null
  >(null); // Logical selection

  // Visual state
  const [visualLines, setVisualLines] = useState<string[]>(['']);
  const [visualCursor, setVisualCursor] = useState<[number, number]>([
    VISUAL_CONSTANTS.INITIAL_CURSOR_ROW,
    VISUAL_CONSTANTS.INITIAL_CURSOR_COL,
  ]);
  const [visualScrollRow, setVisualScrollRow] = useState<number>(INDICES.START);
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

    if (visualCursor[INDICES.START] < visualScrollRow) {
      newVisualScrollRow = visualCursor[INDICES.START];
    } else if (visualCursor[INDICES.START] >= visualScrollRow + height) {
      newVisualScrollRow =
        visualCursor[INDICES.START] - height + INDICES.SINGLE_STEP;
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
    const state = undoStack[undoStack.length - INDICES.SINGLE_STEP];
    if (!state) return false;

    setUndoStack((prev) => prev.slice(INDICES.START, INDICES.NOT_FOUND));
    const currentSnapshot = { lines: [...lines], cursorRow, cursorCol };
    setRedoStack((prev) => [...prev, currentSnapshot]);
    return _restoreState(state);
  }, [undoStack, lines, cursorRow, cursorCol, _restoreState]);

  const redo = useCallback((): boolean => {
    const state = redoStack[redoStack.length - INDICES.SINGLE_STEP];
    if (!state) return false;

    setRedoStack((prev) => prev.slice(INDICES.START, INDICES.NOT_FOUND));
    const currentSnapshot = { lines: [...lines], cursorRow, cursorCol };
    setUndoStack((prev) => [...prev, currentSnapshot]);
    return _restoreState(state);
  }, [redoStack, lines, cursorRow, cursorCol, _restoreState]);

  const insertStr = useCallback(
    (str: string): boolean => {
      dbg('insertStr', { str, beforeCursor: [cursorRow, cursorCol] });
      if (str === '') return false;

      pushUndo();
      const normalizedText = normalizeText(str);
      const result = insertTextAtCursor(
        lines,
        cursorRow,
        cursorCol,
        normalizedText,
      );

      setLines(result.newLines);
      setCursorRow(result.newCursorRow);
      setCursorCol(result.newCursorCol);
      setPreferredCol(null);
      return true;
    },
    [pushUndo, cursorRow, cursorCol, lines, setPreferredCol],
  );

  const applyOperations = useCallback(
    (ops: UpdateOperation[]) => {
      if (ops.length === INDICES.START) return;

      const expandedOps: UpdateOperation[] = [];
      for (const op of ops) {
        if (op.type === 'insert') {
          let currentText = '';
          for (const char of toCodePoints(op.payload)) {
            if (char.codePointAt(0) === ASCII_CODES.DELETE) {
              // \x7f
              if (currentText.length > INDICES.START) {
                expandedOps.push({ type: 'insert', payload: currentText });
                currentText = '';
              }
              expandedOps.push({ type: 'backspace' });
            } else {
              currentText += char;
            }
          }
          if (currentText.length > INDICES.START) {
            expandedOps.push({ type: 'insert', payload: currentText });
          }
        } else {
          expandedOps.push(op);
        }
      }

      if (expandedOps.length === INDICES.START) {
        return;
      }

      pushUndo(); // Snapshot before applying batch of updates

      const newLines = [...lines];
      let newCursorRow = cursorRow;
      let newCursorCol = cursorCol;

      const currentLine = (r: number) => newLines[r] ?? '';

      for (const op of expandedOps) {
        if (op.type === 'insert') {
          const normalizedText = normalizeText(op.payload);
          const result = insertTextAtCursor(
            newLines,
            newCursorRow,
            newCursorCol,
            normalizedText,
          );

          // Replace the entire array contents
          newLines.length = INDICES.START;
          newLines.push(...result.newLines);
          newCursorRow = result.newCursorRow;
          newCursorCol = result.newCursorCol;
        } else if (op.type === 'backspace') {
          if (newCursorCol === INDICES.START && newCursorRow === INDICES.START)
            continue;

          if (newCursorCol > INDICES.START) {
            const lineContent = currentLine(newCursorRow);
            newLines[newCursorRow] =
              cpSlice(
                lineContent,
                INDICES.START,
                newCursorCol - INDICES.SINGLE_STEP,
              ) + cpSlice(lineContent, newCursorCol);
            newCursorCol--;
          } else if (newCursorRow > INDICES.START) {
            const prevLineContent = currentLine(
              newCursorRow - INDICES.SINGLE_STEP,
            );
            const currentLineContentVal = currentLine(newCursorRow);
            const newCol = cpLen(prevLineContent);
            newLines[newCursorRow - INDICES.SINGLE_STEP] =
              prevLineContent + currentLineContentVal;
            newLines.splice(newCursorRow, INDICES.SINGLE_STEP);
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
      const minLengthToInferAsDragDrop =
        TEXT_PROCESSING.MIN_DRAG_DROP_PATH_LENGTH;
      if (ch.length >= minLengthToInferAsDragDrop) {
        // Possible drag and drop of a file path.
        let potentialPath = ch;
        if (
          potentialPath.length > TEXT_PROCESSING.MIN_QUOTED_PATH_LENGTH &&
          potentialPath.startsWith("'") &&
          potentialPath.endsWith("'")
        ) {
          potentialPath = ch.slice(
            STRING_PROCESSING.REMOVE_FIRST_CHAR,
            STRING_PROCESSING.REMOVE_LAST_CHAR,
          );
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
    if (cursorCol === INDICES.START && cursorRow === INDICES.START) return;
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
          cpSlice(lineContent, INDICES.START, cursorCol) +
          cpSlice(lineContent, cursorCol + INDICES.SINGLE_STEP);
        return newLines;
      });
    } else if (cursorRow < lines.length - INDICES.SINGLE_STEP) {
      pushUndo();
      const nextLineContent = currentLine(cursorRow + INDICES.SINGLE_STEP);
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + INDICES.SINGLE_STEP, INDICES.SINGLE_STEP);
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
      setLines(
        newContentLines.length === INDICES.START ? [''] : newContentLines,
      );
      // Set logical cursor to the end of the new text
      const lastNewLineIndex = newContentLines.length - INDICES.SINGLE_STEP;
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
        startRow < INDICES.START ||
        startCol < INDICES.START ||
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

      const sCol = clamp(startCol, INDICES.START, currentLineLen(startRow));
      const eCol = clamp(endCol, INDICES.START, currentLineLen(endRow));

      const prefix = cpSlice(currentLine(startRow), INDICES.START, sCol);
      const suffix = cpSlice(currentLine(endRow), eCol);
      const normalisedReplacement = replacementText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      const replacementParts = normalisedReplacement.split('\n');

      setLines((prevLines) => {
        const newLines = [...prevLines];
        // Remove lines between startRow and endRow (exclusive of startRow, inclusive of endRow if different)
        if (startRow < endRow) {
          newLines.splice(startRow + INDICES.SINGLE_STEP, endRow - startRow);
        }

        // Construct the new content for the startRow
        newLines[startRow] = prefix + replacementParts[INDICES.START];

        // If replacementText has multiple lines, insert them
        if (replacementParts.length > INDICES.SINGLE_STEP) {
          const lastReplacementPart = replacementParts.pop() ?? ''; // parts are already split by \n
          // Insert middle parts (if any)
          if (replacementParts.length > INDICES.SINGLE_STEP) {
            // parts[0] is already used
            newLines.splice(
              startRow + INDICES.SINGLE_STEP,
              INDICES.START,
              ...replacementParts.slice(INDICES.SINGLE_STEP),
            );
          }

          // The line where the last part of the replacement will go
          const targetRowForLastPart =
            startRow + (replacementParts.length - INDICES.SINGLE_STEP); // -1 because parts[0] is on startRow
          // If the last part is not the first part (multi-line replacement)
          if (
            targetRowForLastPart > startRow ||
            (replacementParts.length === INDICES.SINGLE_STEP &&
              lastReplacementPart !== '')
          ) {
            // If the target row for the last part doesn't exist (because it's a new line created by replacement)
            // ensure it's created before trying to append suffix.
            // This case should be handled by splice if replacementParts.length > 1
            // For single line replacement that becomes multi-line due to parts.length > 1 logic, this is tricky.
            // Let's assume newLines[targetRowForLastPart] exists due to previous splice or it's newLines[startRow]
            if (
              newLines[targetRowForLastPart] === undefined &&
              targetRowForLastPart === startRow + INDICES.SINGLE_STEP &&
              replacementParts.length === INDICES.SINGLE_STEP
            ) {
              // This implies a single line replacement that became two lines.
              // e.g. "abc" replace "b" with "B\nC" -> "aB", "C", "c"
              // Here, lastReplacementPart is "C", targetRowForLastPart is startRow + 1
              newLines.splice(
                targetRowForLastPart,
                INDICES.START,
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
          setCursorCol(cpLen(prefix) + cpLen(replacementParts[INDICES.START]));
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
    if (cursorCol === INDICES.START && cursorRow === INDICES.START) return;
    if (cursorCol === INDICES.START) {
      backspace();
      return;
    }
    pushUndo();
    const lineContent = currentLine(cursorRow);
    const arr = toCodePoints(lineContent);
    let start = cursorCol;
    let onlySpaces = true;
    for (let i = INDICES.START; i < start; i++) {
      if (isWordChar(arr[i])) {
        onlySpaces = false;
        break;
      }
    }
    if (onlySpaces && start > INDICES.START) {
      start--;
    } else {
      while (
        start > INDICES.START &&
        !isWordChar(arr[start - INDICES.SINGLE_STEP])
      )
        start -= INDICES.SINGLE_STEP;
      while (
        start > INDICES.START &&
        isWordChar(arr[start - INDICES.SINGLE_STEP])
      )
        start -= INDICES.SINGLE_STEP;
    }
    setLines((prevLines) => {
      const newLines = [...prevLines];
      newLines[cursorRow] =
        cpSlice(lineContent, INDICES.START, start) +
        cpSlice(lineContent, cursorCol);
      return newLines;
    });
    setCursorCol(start);
    setPreferredCol(null);
  }, [pushUndo, cursorRow, cursorCol, currentLine, backspace, setPreferredCol]);

  const deleteWordRight = useCallback((): void => {
    dbg('deleteWordRight', { beforeCursor: [cursorRow, cursorCol] });
    const lineContent = currentLine(cursorRow);
    const arr = toCodePoints(lineContent);
    if (
      cursorCol >= arr.length &&
      cursorRow === lines.length - INDICES.SINGLE_STEP
    )
      return;
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
        cpSlice(lineContent, INDICES.START, cursorCol) +
        cpSlice(lineContent, end);
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
        newLines[cursorRow] = cpSlice(lineContent, INDICES.START, cursorCol);
        return newLines;
      });
      // Cursor position and preferredCol do not change in this case
    } else if (
      cursorCol === currentLineLen(cursorRow) &&
      cursorRow < lines.length - INDICES.SINGLE_STEP
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
    if (cursorCol > INDICES.START) {
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = cpSlice(lineContent, cursorCol);
        return newLines;
      });
      setCursorCol(INDICES.START);
      setPreferredCol(null);
    }
  }, [pushUndo, cursorRow, cursorCol, currentLine, setPreferredCol]);

  const move = useCallback(
    (dir: Direction): void => {
      // Create movement context
      const context: MovementContext = {
        visualLines,
        visualCursor,
        preferredCol,
        lines,
        currentLineLen,
        visualToLogicalMap,
        logicalToVisualMap,
      };

      // Dispatch to appropriate movement function
      const movementFunction = movementFunctions[dir];
      if (!movementFunction) {
        // Unknown direction, no-op
        return;
      }

      // Execute movement and get result
      const { newVisualRow, newVisualCol, newPreferredCol } =
        movementFunction(context);

      setVisualCursor([newVisualRow, newVisualCol]);
      setPreferredCol(newPreferredCol);

      // Update logical cursor based on new visual cursor
      if (visualToLogicalMap[newVisualRow]) {
        const [logRow, logStartCol] = visualToLogicalMap[newVisualRow];
        setCursorRow(logRow);
        setCursorCol(
          clamp(
            logStartCol + newVisualCol,
            INDICES.START,
            currentLineLen(logRow),
          ),
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
        if (typeof status === 'number' && status !== INDICES.START)
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
      const { sequence: _input } = key;
      dbg('handleInput', {
        key,
        cursor: [cursorRow, cursorCol],
        visualCursor,
      });
      const beforeText = text;
      const beforeLogicalCursor = [cursorRow, cursorCol];
      const beforeVisualCursor = [...visualCursor];

      // Special case: escape key still returns false to exit
      if (key.name === 'escape') return false;

      // Normalize the key event for command pattern
      const keySignature = normalizeKey(key);

      // Create editor context for command execution
      const editorContext: EditorContext = {
        insert,
        newline,
        backspace,
        del,
        deleteWordLeft,
        deleteWordRight,
        move,
        cursor: { row: cursorRow, col: cursorCol },
        text,
      };

      // Resolve and execute command using the command pattern
      const command = keyBindingResolver.resolve(keySignature, editorContext);
      if (command) {
        dbg('handleInput:command', {
          command: command.description,
          keySignature,
        });
        command.execute(editorContext);
      }

      const textChanged = text !== beforeText;
      // After operations, visualCursor might not be immediately updated if the change
      // was to `lines`, `cursorRow`, or `cursorCol` which then triggers the useEffect.
      // So, for return value, we check logical cursor change.
      const cursorChanged =
        cursorRow !== beforeLogicalCursor[INDICES.START] ||
        cursorCol !== beforeLogicalCursor[INDICES.SINGLE_STEP] ||
        visualCursor[INDICES.START] !== beforeVisualCursor[INDICES.START] ||
        visualCursor[INDICES.SINGLE_STEP] !==
          beforeVisualCursor[INDICES.SINGLE_STEP];

      dbg('handleInput:after', {
        cursor: [cursorRow, cursorCol],
        visualCursor,
        text,
        commandExecuted: command?.description,
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
    insertStr,
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
        for (let r = sr + INDICES.SINGLE_STEP; r < er; r++)
          parts.push(currentLine(r));
        parts.push(cpSlice(currentLine(er), INDICES.START, ec));
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
  /**
   * Insert a string that may contain newlines.
   * Handles text normalization and multi-line insertion.
   */
  insertStr: (str: string) => boolean;
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
