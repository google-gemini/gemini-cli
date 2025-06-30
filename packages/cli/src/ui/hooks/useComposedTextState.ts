/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import {
  useLogicalTextState,
  type UseLogicalTextStateReturn,
} from './useLogicalTextState.js';
import {
  useVisualLayoutState,
  type UseVisualLayoutStateReturn,
} from './useVisualLayoutState.js';
import {
  useHistoryState,
  type UseHistoryStateReturn,
} from './useHistoryState.js';
import {
  useSelectionState,
  type UseSelectionStateReturn,
} from './useSelectionState.js';

/**
 * Configuration options for the composed text state hook
 */
export interface UseComposedTextStateOptions {
  // Initial state
  initialLines?: string[];
  initialCursorRow?: number;
  initialCursorCol?: number;
  viewportWidth?: number;
  viewportHeight?: number;

  // History settings
  historyLimit?: number;

  // External callbacks
  onTextChange?: (lines: string[]) => void;
  onCursorChange?: (row: number, col: number) => void;
  onSelectionChange?: (
    anchor: [number, number] | null,
    extent: [number, number] | null,
  ) => void;
  onClipboardChange?: (content: string) => void;
}

/**
 * Return type for the composed text state hook
 */
export interface UseComposedTextStateReturn {
  // State from individual hooks
  logical: UseLogicalTextStateReturn;
  visual: UseVisualLayoutStateReturn;
  history: UseHistoryStateReturn;
  selection: UseSelectionStateReturn;

  // Composed operations
  insertTextWithHistory: (text: string) => void;
  deleteWithHistory: () => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  cut: () => void;
  paste: (text: string) => void;
}

/**
 * Composed hook that coordinates all text state management domains.
 *
 * This hook demonstrates the integration layer pattern, showing how
 * the individual state hooks can work together through callback
 * coordination to provide a complete text editing experience.
 */
export function useComposedTextState({
  initialLines = [''],
  initialCursorRow = 0,
  initialCursorCol = 0,
  viewportWidth = 80,
  viewportHeight = 25,
  historyLimit = 100,
  onTextChange,
  onCursorChange,
  onSelectionChange,
  onClipboardChange,
}: UseComposedTextStateOptions = {}): UseComposedTextStateReturn {
  // Initialize logical text state
  const logical = useLogicalTextState({
    initialLines,
    initialCursorRow,
    initialCursorCol,
    onLinesChange: onTextChange,
    onCursorChange,
  });

  // Initialize visual layout state (coordinated with logical state)
  const visual = useVisualLayoutState({
    logicalLines: logical.lines,
    logicalCursor: [logical.cursorRow, logical.cursorCol],
    viewportWidth,
    viewportHeight,
  });

  // Initialize history state
  const history = useHistoryState({
    historyLimit,
  });

  // Initialize selection state
  const selection = useSelectionState({
    onSelectionChange,
    onClipboardChange,
    onCutText: useCallback((start: [number, number], end: [number, number]) => {
      // When text is cut, delete the selected text
      // This would need actual text deletion logic based on selection bounds
      // The actual implementation would be handled at a higher level
      console.log('Cut text from', start, 'to', end);
    }, []),
  });

  // Composed operations that coordinate between domains

  const insertTextWithHistory = useCallback(
    (text: string) => {
      // Save current state to history before making changes
      history.pushUndo({
        lines: logical.lines,
        cursorRow: logical.cursorRow,
        cursorCol: logical.cursorCol,
      });

      // Clear any existing selection
      selection.clearSelection();

      // Insert the text
      logical.insertText(text);
    },
    [history, logical, selection],
  );

  const deleteWithHistory = useCallback(() => {
    // Save current state to history before making changes
    history.pushUndo({
      lines: logical.lines,
      cursorRow: logical.cursorRow,
      cursorCol: logical.cursorCol,
    });

    // Clear any existing selection
    selection.clearSelection();

    // Delete character before cursor
    logical.deleteCharBefore();
  }, [history, logical, selection]);

  const undo = useCallback(() => {
    const entry = history.undo();
    if (entry) {
      // Restore state from history
      logical.setLines(entry.lines);
      logical.setCursor(entry.cursorRow, entry.cursorCol);

      // Clear selection when undoing
      selection.clearSelection();
    }
  }, [history, logical, selection]);

  const redo = useCallback(() => {
    const entry = history.redo();
    if (entry) {
      // Restore state from history
      logical.setLines(entry.lines);
      logical.setCursor(entry.cursorRow, entry.cursorCol);

      // Clear selection when redoing
      selection.clearSelection();
    }
  }, [history, logical, selection]);

  const copy = useCallback(() => {
    if (selection.hasSelection) {
      selection.copyToClipboard(logical.lines);
    }
  }, [selection, logical]);

  const cut = useCallback(() => {
    if (selection.hasSelection) {
      // Save current state to history before cutting
      history.pushUndo({
        lines: logical.lines,
        cursorRow: logical.cursorRow,
        cursorCol: logical.cursorCol,
      });

      selection.cutToClipboard(logical.lines);

      // The actual text deletion would be handled by the onCutText callback
      // in a real implementation
    }
  }, [selection, logical, history]);

  const paste = useCallback(
    (text: string) => {
      // If there's a selection, we'll replace it
      if (selection.hasSelection) {
        // Save state before pasting
        history.pushUndo({
          lines: logical.lines,
          cursorRow: logical.cursorRow,
          cursorCol: logical.cursorCol,
        });

        // Clear selection and insert text
        selection.clearSelection();
        logical.insertText(text);
      } else {
        // Just insert at current cursor position
        insertTextWithHistory(text);
      }
    },
    [selection, logical, history, insertTextWithHistory],
  );

  return {
    // Individual hook states
    logical,
    visual,
    history,
    selection,

    // Composed operations
    insertTextWithHistory,
    deleteWithHistory,
    undo,
    redo,
    copy,
    cut,
    paste,
  };
}
