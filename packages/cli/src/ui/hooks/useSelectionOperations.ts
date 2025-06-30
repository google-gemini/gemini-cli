/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { cpLen } from '../utils/textUtils.js';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type {
  UseSelectionStateReturn,
  Position,
  SelectionBounds,
} from './useSelectionState.js';

/**
 * Configuration options for useSelectionOperations hook
 */
export interface UseSelectionOperationsOptions {
  /** Skip firing callbacks for operations */
  skipCallbacks?: boolean;
}

/**
 * Return type for useSelectionOperations hook
 */
export interface UseSelectionOperationsReturn {
  // Core selection state (read-only access)
  selectionAnchor: Position | null;
  selectionExtent: Position | null;
  hasSelection: boolean;
  clipboardContent: string;

  // Selection operations
  copy: () => string | null;
  paste: () => boolean;
  cut?: () => void;
  startSelection: () => void;

  // Selection management (pass-through)
  setSelection: (anchor: Position | null, extent: Position | null) => void;
  setSelectionAnchor: (anchor: Position | null) => void;
  setSelectionExtent: (extent: Position | null) => void;
  clearSelection: () => void;

  // Selection utilities (pass-through)
  getSelectionBounds: () => SelectionBounds | null;
  isPositionInSelection: (position: Position) => boolean;
  getSelectedText: (lines: string[]) => string;

  // Special selection operations (pass-through)
  selectAll: () => void;
  selectLine: (lineIndex: number) => void;
  selectWord: (
    position: Position,
    wordStart: Position,
    wordEnd: Position,
  ) => void;
}

/**
 * Custom hook for managing text selection operations.
 *
 * Provides selection management operations that coordinate with logical text state
 * and selection state management. Handles copy, paste, cut operations and
 * selection manipulation while maintaining consistency with the underlying
 * state management hooks.
 */
export function useSelectionOperations(
  logicalState: UseLogicalTextStateReturn,
  selectionState: UseSelectionStateReturn,
  options: UseSelectionOperationsOptions = {},
): UseSelectionOperationsReturn {
  // Copy selected text to clipboard
  const copy = useCallback((): string | null => {
    if (!selectionState.hasSelection) {
      return null;
    }

    const selectedText = selectionState.getSelectedText(logicalState.lines);
    if (selectedText === '') {
      return null;
    }

    selectionState.copyToClipboard(logicalState.lines, {
      skipCallbacks: options.skipCallbacks,
    });
    return selectedText;
  }, [selectionState, logicalState.lines, options.skipCallbacks]);

  // Paste clipboard content at current cursor
  const paste = useCallback((): boolean => {
    if (selectionState.clipboardContent === '') {
      return false;
    }

    logicalState.insertText(selectionState.clipboardContent, {
      skipCallbacks: options.skipCallbacks,
    });
    return true;
  }, [selectionState.clipboardContent, logicalState, options.skipCallbacks]);

  // Cut selected text to clipboard
  const cut = useCallback((): void => {
    if (!selectionState.hasSelection) {
      return;
    }

    selectionState.cutToClipboard(logicalState.lines, {
      skipCallbacks: options.skipCallbacks,
    });
  }, [selectionState, logicalState.lines, options.skipCallbacks]);

  // Start selection at current cursor position
  const startSelection = useCallback((): void => {
    const currentPosition: Position = [
      logicalState.cursorRow,
      logicalState.cursorCol,
    ];
    selectionState.setSelectionAnchor(currentPosition, {
      skipCallbacks: options.skipCallbacks,
    });
  }, [
    logicalState.cursorRow,
    logicalState.cursorCol,
    selectionState,
    options.skipCallbacks,
  ]);

  // Pass-through selection management functions
  const setSelection = useCallback(
    (anchor: Position | null, extent: Position | null): void => {
      selectionState.setSelection(anchor, extent, {
        skipCallbacks: options.skipCallbacks,
      });
    },
    [selectionState, options.skipCallbacks],
  );

  const setSelectionAnchor = useCallback(
    (anchor: Position | null): void => {
      selectionState.setSelectionAnchor(anchor, {
        skipCallbacks: options.skipCallbacks,
      });
    },
    [selectionState, options.skipCallbacks],
  );

  const setSelectionExtent = useCallback(
    (extent: Position | null): void => {
      selectionState.setSelectionExtent(extent, {
        skipCallbacks: options.skipCallbacks,
      });
    },
    [selectionState, options.skipCallbacks],
  );

  const clearSelection = useCallback((): void => {
    selectionState.clearSelection({ skipCallbacks: options.skipCallbacks });
  }, [selectionState, options.skipCallbacks]);

  // Pass-through utility functions
  const getSelectionBounds = useCallback(
    (): SelectionBounds | null => selectionState.getSelectionBounds(),
    [selectionState],
  );

  const isPositionInSelection = useCallback(
    (position: Position): boolean =>
      selectionState.isPositionInSelection(position),
    [selectionState],
  );

  const getSelectedText = useCallback(
    (lines: string[]): string => selectionState.getSelectedText(lines),
    [selectionState],
  );

  // Special selection operations with calculated parameters
  const selectAll = useCallback((): void => {
    const lineCount = logicalState.lines.length;
    const lastLineLength = cpLen(logicalState.lines[lineCount - 1] ?? '');
    selectionState.selectAll(lineCount, lastLineLength, {
      skipCallbacks: options.skipCallbacks,
    });
  }, [logicalState.lines, selectionState, options.skipCallbacks]);

  const selectLine = useCallback(
    (lineIndex: number): void => {
      const lineLength = cpLen(logicalState.lines[lineIndex] ?? '');
      selectionState.selectLine(lineIndex, lineLength, {
        skipCallbacks: options.skipCallbacks,
      });
    },
    [logicalState.lines, selectionState, options.skipCallbacks],
  );

  const selectWord = useCallback(
    (position: Position, wordStart: Position, wordEnd: Position): void => {
      selectionState.selectWord(position, wordStart, wordEnd, {
        skipCallbacks: options.skipCallbacks,
      });
    },
    [selectionState, options.skipCallbacks],
  );

  return {
    // Core selection state (read-only access)
    selectionAnchor: selectionState.selectionAnchor,
    selectionExtent: selectionState.selectionExtent,
    hasSelection: selectionState.hasSelection,
    clipboardContent: selectionState.clipboardContent,

    // Selection operations
    copy,
    paste,
    cut,
    startSelection,

    // Selection management (pass-through)
    setSelection,
    setSelectionAnchor,
    setSelectionExtent,
    clearSelection,

    // Selection utilities (pass-through)
    getSelectionBounds,
    isPositionInSelection,
    getSelectedText,

    // Special selection operations (pass-through with calculated params)
    selectAll,
    selectLine,
    selectWord,
  };
}
