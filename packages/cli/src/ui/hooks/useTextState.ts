/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect } from 'react';

// Constants from text-buffer.ts
const BUFFER_LIMITS = {
  HISTORY_LIMIT: 100,
} as const;

const INDICES = {
  START: 0,
  SINGLE_STEP: 1,
  NOT_FOUND: -1,
} as const;

/**
 * History entry for undo/redo operations.
 * Maintains coordination between text and cursor state.
 */
export interface UndoHistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

/**
 * Cursor position type for coordination with text state
 */
export type CursorPosition = [number, number];

/**
 * Callback for coordinating text and cursor updates
 */
export type TextCursorUpdateCallback = (
  lines: string[],
  cursor: CursorPosition,
) => void;

/**
 * Return type for useTextState hook
 */
export interface UseTextStateReturn {
  // Core state
  lines: string[];
  text: string;

  // History state
  undoStack: UndoHistoryEntry[];
  redoStack: UndoHistoryEntry[];

  // Text operations
  updateText: (newLines: string[], newCursor: CursorPosition) => void;
  setText: (newText: string, newCursor?: CursorPosition) => void;

  // History operations
  pushUndo: (cursor: CursorPosition) => void;
  undo: (
    currentCursor: CursorPosition,
  ) => { lines: string[]; cursor: CursorPosition } | null;
  redo: (
    currentCursor: CursorPosition,
  ) => { lines: string[]; cursor: CursorPosition } | null;

  // Utility
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Props for useTextState hook
 */
export interface UseTextStateProps {
  initialText?: string;
  onChange?: (text: string) => void;
  historyLimit?: number;
}

/**
 * Custom hook for managing text state and history
 *
 * Provides isolated text content management with undo/redo functionality.
 * Coordinates with cursor state through callback patterns to maintain
 * atomic updates while enabling clean separation of concerns.
 */
export function useTextState({
  initialText = '',
  onChange,
  historyLimit = BUFFER_LIMITS.HISTORY_LIMIT,
}: UseTextStateProps): UseTextStateReturn {
  // Core text state
  const [lines, setLines] = useState<string[]>(() => {
    const l = initialText.split('\n');
    return l.length === INDICES.START ? [''] : l;
  });

  // History state
  const [undoStack, setUndoStack] = useState<UndoHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoHistoryEntry[]>([]);

  // Computed text value with memoization
  const text = useMemo(() => lines.join('\n'), [lines]);

  // Update text with cursor coordination
  const updateText = useCallback(
    (newLines: string[], _newCursor: CursorPosition): void => {
      setLines(newLines);
      // Note: cursor update is handled by the coordinating component
      // This maintains separation of concerns while enabling atomic updates
    },
    [],
  );

  // Notify onChange when text changes
  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

  // Set text from string with optional cursor position
  const setText = useCallback(
    (newText: string, newCursor?: CursorPosition): void => {
      const newContentLines = newText.replace(/\r\n?/g, '\n').split('\n');
      const processedLines =
        newContentLines.length === INDICES.START ? [''] : newContentLines;

      // Default cursor to end of text if not provided
      const defaultCursor: CursorPosition = newCursor || [
        processedLines.length - INDICES.SINGLE_STEP,
        processedLines[processedLines.length - INDICES.SINGLE_STEP]?.length ||
          0,
      ];

      updateText(processedLines, defaultCursor);
    },
    [updateText],
  );

  // Create undo snapshot with cursor coordination
  const pushUndo = useCallback(
    (cursor: CursorPosition): void => {
      const snapshot: UndoHistoryEntry = {
        lines: [...lines],
        cursorRow: cursor[0],
        cursorCol: cursor[1],
      };

      setUndoStack((prev) => {
        const newStack = [...prev, snapshot];
        if (newStack.length > historyLimit) {
          newStack.shift();
        }
        return newStack;
      });

      // Clear redo stack when new operation is performed
      setRedoStack([]);
    },
    [lines, historyLimit],
  );

  // Undo operation with cursor coordination
  const undo = useCallback(
    (
      currentCursor: CursorPosition,
    ): { lines: string[]; cursor: CursorPosition } | null => {
      const state = undoStack[undoStack.length - INDICES.SINGLE_STEP];
      if (!state) return null;

      // Save current state to redo stack with current cursor
      setRedoStack((prev) => [
        ...prev,
        {
          lines: [...lines],
          cursorRow: currentCursor[0],
          cursorCol: currentCursor[1],
        },
      ]);
      setUndoStack((prev) => prev.slice(INDICES.START, INDICES.NOT_FOUND));

      // Update text state
      setLines(state.lines);

      // Return state for cursor coordination
      return {
        lines: state.lines,
        cursor: [state.cursorRow, state.cursorCol],
      };
    },
    [undoStack, lines],
  );

  // Redo operation with cursor coordination
  const redo = useCallback(
    (
      currentCursor: CursorPosition,
    ): { lines: string[]; cursor: CursorPosition } | null => {
      const state = redoStack[redoStack.length - INDICES.SINGLE_STEP];
      if (!state) return null;

      // Save current state to undo stack with current cursor
      setUndoStack((prev) => [
        ...prev,
        {
          lines: [...lines],
          cursorRow: currentCursor[0],
          cursorCol: currentCursor[1],
        },
      ]);
      setRedoStack((prev) => prev.slice(INDICES.START, INDICES.NOT_FOUND));

      // Update text state
      setLines(state.lines);

      // Return state for cursor coordination
      return {
        lines: state.lines,
        cursor: [state.cursorRow, state.cursorCol],
      };
    },
    [redoStack, lines],
  );

  // Utility properties
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    // Core state
    lines,
    text,

    // History state
    undoStack,
    redoStack,

    // Text operations
    updateText,
    setText,

    // History operations
    pushUndo,
    undo,
    redo,

    // Utility
    canUndo,
    canRedo,
  };
}
