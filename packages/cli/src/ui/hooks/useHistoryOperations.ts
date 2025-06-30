/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type { UseHistoryStateReturn, HistoryEntry } from './useHistoryState.js';

/**
 * Configuration options for useHistoryOperations hook
 */
export interface UseHistoryOperationsOptions {
  /** Skip firing callbacks for operations */
  skipCallbacks?: boolean;
}

/**
 * Return type for useHistoryOperations hook
 */
export interface UseHistoryOperationsReturn {
  // History capabilities
  canUndo: boolean;
  canRedo: boolean;

  // History operations
  pushUndo: () => void;
  undo: () => boolean;
  redo: () => boolean;

  // History management
  clearHistory: () => void;
  clearUndoStack: () => void;
  clearRedoStack: () => void;

  // Direct access to history stacks (read-only)
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

/**
 * Custom hook for managing text buffer history operations (undo/redo).
 *
 * Provides history management operations that coordinate with logical text state
 * and history state management. Handles creating snapshots, restoring state,
 * and managing undo/redo stacks while maintaining consistency with the
 * underlying state management hooks.
 */
export function useHistoryOperations(
  logicalState: UseLogicalTextStateReturn,
  historyState: UseHistoryStateReturn,
  options: UseHistoryOperationsOptions = {},
): UseHistoryOperationsReturn {
  // Create history snapshot from current logical state
  const pushUndo = useCallback((): void => {
    const snapshot: HistoryEntry = {
      lines: [...logicalState.lines],
      cursorRow: logicalState.cursorRow,
      cursorCol: logicalState.cursorCol,
    };

    historyState.pushUndo(snapshot, { skipCallbacks: options.skipCallbacks });
  }, [
    logicalState.lines,
    logicalState.cursorRow,
    logicalState.cursorCol,
    historyState,
    options.skipCallbacks,
  ]);

  // Restore state from undo operation
  const undo = useCallback((): boolean => {
    const historyEntry = historyState.undo({
      skipCallbacks: options.skipCallbacks,
    });

    if (!historyEntry) {
      return false;
    }

    // Restore the state from history entry
    logicalState.setLines(historyEntry.lines);
    logicalState.setCursor(historyEntry.cursorRow, historyEntry.cursorCol);
    logicalState.setPreferredCol(null);

    return true;
  }, [historyState, logicalState, options.skipCallbacks]);

  // Restore state from redo operation
  const redo = useCallback((): boolean => {
    const historyEntry = historyState.redo({
      skipCallbacks: options.skipCallbacks,
    });

    if (!historyEntry) {
      return false;
    }

    // Restore the state from history entry
    logicalState.setLines(historyEntry.lines);
    logicalState.setCursor(historyEntry.cursorRow, historyEntry.cursorCol);
    logicalState.setPreferredCol(null);

    return true;
  }, [historyState, logicalState, options.skipCallbacks]);

  // Clear all history
  const clearHistory = useCallback((): void => {
    historyState.clearHistory({ skipCallbacks: options.skipCallbacks });
  }, [historyState, options.skipCallbacks]);

  // Clear undo stack only
  const clearUndoStack = useCallback((): void => {
    historyState.clearUndoStack({ skipCallbacks: options.skipCallbacks });
  }, [historyState, options.skipCallbacks]);

  // Clear redo stack only
  const clearRedoStack = useCallback((): void => {
    historyState.clearRedoStack({ skipCallbacks: options.skipCallbacks });
  }, [historyState, options.skipCallbacks]);

  return {
    // History capabilities
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,

    // History operations
    pushUndo,
    undo,
    redo,

    // History management
    clearHistory,
    clearUndoStack,
    clearRedoStack,

    // Direct access to history stacks (read-only)
    undoStack: historyState.undoStack,
    redoStack: historyState.redoStack,
  };
}
