/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { cpLen, cpSlice } from '../utils/textUtils.js';

// Constants for indices and text processing
const INDICES = {
  START: 0,
  SINGLE_STEP: 1,
} as const;

/**
 * Configuration options for useLogicalTextState hook
 */
export interface UseLogicalTextStateOptions {
  /** Initial lines of text */
  initialLines?: string[];
  /** Initial cursor row position */
  initialCursorRow?: number;
  /** Initial cursor column position */
  initialCursorCol?: number;
  /** Initial preferred column for vertical movement */
  initialPreferredCol?: number | null;
  /** Callback fired when lines change */
  onLinesChange?: (lines: string[]) => void;
  /** Callback fired when cursor position changes */
  onCursorChange?: (row: number, col: number) => void;
}

/**
 * Options for text manipulation operations
 */
export interface TextOperationOptions {
  /** Skip firing callbacks for this operation */
  skipCallbacks?: boolean;
}

/**
 * Result of text insertion operation
 */
interface TextInsertionResult {
  newLines: string[];
  newCursorRow: number;
  newCursorCol: number;
}

/**
 * Return type for useLogicalTextState hook
 */
export interface UseLogicalTextStateReturn {
  // Core state
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  preferredCol: number | null;

  // Line operations
  setLines: (lines: string[]) => void;
  insertText: (text: string, options?: TextOperationOptions) => void;
  deleteCharBefore: (options?: TextOperationOptions) => void;
  deleteCharAfter: (options?: TextOperationOptions) => void;

  // Cursor operations
  setCursor: (row: number, col: number) => void;
  setPreferredCol: (col: number | null) => void;

  // Utility functions
  getCurrentLine: () => string;
  getCurrentLineLength: () => number;
  isAtStartOfLine: () => boolean;
  isAtEndOfLine: () => boolean;
}

/**
 * Utility function to clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Inserts text at a specific cursor position within a lines array.
 * Handles both single-line and multi-line insertions with proper cursor positioning.
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

/**
 * Custom hook for managing logical text state (lines, cursor position, preferred column).
 *
 * Provides isolated text content management with cursor coordination.
 * Maintains logical text lines and cursor position while enabling coordination
 * with other state domains through callback patterns.
 */
export function useLogicalTextState({
  initialLines = [''],
  initialCursorRow = 0,
  initialCursorCol = 0,
  initialPreferredCol = null,
  onLinesChange,
  onCursorChange,
}: UseLogicalTextStateOptions = {}): UseLogicalTextStateReturn {
  // Normalize initial lines - ensure at least one empty line
  const normalizedInitialLines =
    initialLines.length === 0 ? [''] : initialLines;

  // Core text state
  const [lines, setLinesState] = useState<string[]>(normalizedInitialLines);

  // Cursor state
  const [cursorRow, setCursorRowState] = useState<number>(() =>
    clamp(initialCursorRow, 0, normalizedInitialLines.length - 1),
  );
  const [cursorCol, setCursorColState] = useState<number>(() => {
    const targetRow = clamp(
      initialCursorRow,
      0,
      normalizedInitialLines.length - 1,
    );
    const maxCol = cpLen(normalizedInitialLines[targetRow] ?? '');
    return clamp(initialCursorCol, 0, maxCol);
  });
  const [preferredCol, setPreferredColState] = useState<number | null>(
    initialPreferredCol,
  );

  // Line operations
  const setLines = useCallback(
    (newLines: string[]): void => {
      const processedLines = newLines.length === 0 ? [''] : newLines;
      setLinesState(processedLines);
      onLinesChange?.(processedLines);
    },
    [onLinesChange],
  );

  const insertText = useCallback(
    (text: string, options: TextOperationOptions = {}): void => {
      if (text === '') return;

      const result = insertTextAtCursor(lines, cursorRow, cursorCol, text);

      setLinesState(result.newLines);
      setCursorRowState(result.newCursorRow);
      setCursorColState(result.newCursorCol);
      setPreferredColState(null); // Clear preferred column on text insertion

      if (!options.skipCallbacks) {
        onLinesChange?.(result.newLines);
        onCursorChange?.(result.newCursorRow, result.newCursorCol);
      }
    },
    [lines, cursorRow, cursorCol, onLinesChange, onCursorChange],
  );

  const deleteCharBefore = useCallback(
    (options: TextOperationOptions = {}): void => {
      if (cursorCol === INDICES.START && cursorRow === INDICES.START) {
        return; // Nothing to delete
      }

      const newLines = [...lines];
      let newCursorRow = cursorRow;
      let newCursorCol = cursorCol;

      if (cursorCol > INDICES.START) {
        // Delete character in current line
        const lineContent = newLines[cursorRow] ?? '';
        newLines[cursorRow] =
          cpSlice(lineContent, INDICES.START, cursorCol - INDICES.SINGLE_STEP) +
          cpSlice(lineContent, cursorCol);
        newCursorCol = cursorCol - INDICES.SINGLE_STEP;
      } else if (cursorRow > INDICES.START) {
        // Join with previous line
        const prevLineContent = newLines[cursorRow - INDICES.SINGLE_STEP] ?? '';
        const currentLineContent = newLines[cursorRow] ?? '';
        newLines[cursorRow - INDICES.SINGLE_STEP] =
          prevLineContent + currentLineContent;
        newLines.splice(cursorRow, INDICES.SINGLE_STEP);
        newCursorRow = cursorRow - INDICES.SINGLE_STEP;
        newCursorCol = cpLen(prevLineContent);
      }

      setLinesState(newLines);
      setCursorRowState(newCursorRow);
      setCursorColState(newCursorCol);
      setPreferredColState(null); // Clear preferred column

      if (!options.skipCallbacks) {
        onLinesChange?.(newLines);
        onCursorChange?.(newCursorRow, newCursorCol);
      }
    },
    [lines, cursorRow, cursorCol, onLinesChange, onCursorChange],
  );

  const deleteCharAfter = useCallback(
    (options: TextOperationOptions = {}): void => {
      const lineContent = lines[cursorRow] ?? '';
      const lineLength = cpLen(lineContent);

      if (cursorCol < lineLength) {
        // Delete character in current line
        const newLines = [...lines];
        newLines[cursorRow] =
          cpSlice(lineContent, INDICES.START, cursorCol) +
          cpSlice(lineContent, cursorCol + INDICES.SINGLE_STEP);

        setLinesState(newLines);
        setPreferredColState(null);

        if (!options.skipCallbacks) {
          onLinesChange?.(newLines);
        }
      } else if (cursorRow < lines.length - INDICES.SINGLE_STEP) {
        // Join with next line
        const nextLineContent = lines[cursorRow + INDICES.SINGLE_STEP] ?? '';
        const newLines = [...lines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + INDICES.SINGLE_STEP, INDICES.SINGLE_STEP);

        setLinesState(newLines);
        setPreferredColState(null);

        if (!options.skipCallbacks) {
          onLinesChange?.(newLines);
        }
      }
    },
    [lines, cursorRow, cursorCol, onLinesChange],
  );

  // Cursor operations
  const setCursor = useCallback(
    (row: number, col: number): void => {
      const newRow = clamp(row, 0, lines.length - 1);
      const maxCol = cpLen(lines[newRow] ?? '');
      const newCol = clamp(col, 0, maxCol);

      setCursorRowState(newRow);
      setCursorColState(newCol);

      // Clear preferred column on horizontal movement
      if (row === cursorRow && col !== cursorCol) {
        setPreferredColState(null);
      }

      onCursorChange?.(newRow, newCol);
    },
    [lines, cursorRow, cursorCol, onCursorChange],
  );

  const setPreferredCol = useCallback((col: number | null): void => {
    setPreferredColState(col);
  }, []);

  // Utility functions
  const getCurrentLine = useCallback(
    (): string => lines[cursorRow] ?? '',
    [lines, cursorRow],
  );

  const getCurrentLineLength = useCallback(
    (): number => cpLen(lines[cursorRow] ?? ''),
    [lines, cursorRow],
  );

  const isAtStartOfLine = useCallback(
    (): boolean => cursorCol === 0,
    [cursorCol],
  );

  const isAtEndOfLine = useCallback((): boolean => {
    const lineLength = cpLen(lines[cursorRow] ?? '');
    return cursorCol === lineLength;
  }, [lines, cursorRow, cursorCol]);

  return {
    // Core state
    lines,
    cursorRow,
    cursorCol,
    preferredCol,

    // Line operations
    setLines,
    insertText,
    deleteCharBefore,
    deleteCharAfter,

    // Cursor operations
    setCursor,
    setPreferredCol,

    // Utility functions
    getCurrentLine,
    getCurrentLineLength,
    isAtStartOfLine,
    isAtEndOfLine,
  };
}
