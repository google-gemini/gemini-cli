/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

// Constants for history management
const DEFAULT_HISTORY_LIMIT = 100;

/**
 * History entry interface for undo/redo operations
 */
export interface HistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

/**
 * Configuration options for useHistoryState hook
 */
export interface UseHistoryStateOptions {
  /** Maximum number of history entries to keep */
  historyLimit?: number;
  /** Initial undo stack entries */
  initialUndoStack?: HistoryEntry[];
  /** Initial redo stack entries */
  initialRedoStack?: HistoryEntry[];
  /** Callback fired when undo stack changes */
  onUndoStackChange?: (undoStack: HistoryEntry[]) => void;
  /** Callback fired when redo stack changes */
  onRedoStackChange?: (redoStack: HistoryEntry[]) => void;
}

/**
 * Options for history operations
 */
export interface HistoryOperationOptions {
  /** Skip firing callbacks for this operation */
  skipCallbacks?: boolean;
}

/**
 * Return type for useHistoryState hook
 */
export interface UseHistoryStateReturn {
  // Core state
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;

  // History operations
  pushUndo: (entry: HistoryEntry, options?: HistoryOperationOptions) => void;
  undo: (options?: HistoryOperationOptions) => HistoryEntry | null;
  redo: (options?: HistoryOperationOptions) => HistoryEntry | null;

  // Stack management
  clearUndoStack: (options?: HistoryOperationOptions) => void;
  clearRedoStack: (options?: HistoryOperationOptions) => void;
  clearHistory: (options?: HistoryOperationOptions) => void;
}

/**
 * Custom hook for managing undo/redo history state.
 *
 * Provides isolated history management with undo and redo functionality.
 * Maintains separate stacks for undo and redo operations while enabling
 * coordination with other state domains through callback patterns.
 */
export function useHistoryState({
  historyLimit = DEFAULT_HISTORY_LIMIT,
  initialUndoStack = [],
  initialRedoStack = [],
  onUndoStackChange,
  onRedoStackChange,
}: UseHistoryStateOptions = {}): UseHistoryStateReturn {
  // Normalize history limit to prevent negative values
  const normalizedLimit = Math.max(0, historyLimit);

  // History stacks
  const [undoStack, setUndoStackState] =
    useState<HistoryEntry[]>(initialUndoStack);
  const [redoStack, setRedoStackState] =
    useState<HistoryEntry[]>(initialRedoStack);

  // Push new entry to undo stack
  const pushUndo = useCallback(
    (entry: HistoryEntry, options: HistoryOperationOptions = {}): void => {
      if (normalizedLimit === 0) {
        // If limit is 0, don't store any history
        return;
      }

      // Update both stacks in sequence
      setUndoStackState((prevStack) => {
        const newStack = [...prevStack, entry];

        // Enforce history limit
        if (newStack.length > normalizedLimit) {
          newStack.splice(0, newStack.length - normalizedLimit);
        }

        if (!options.skipCallbacks) {
          onUndoStackChange?.(newStack);
        }

        return newStack;
      });

      // Clear redo stack when new undo is pushed
      setRedoStackState((prevStack) => {
        if (prevStack.length > 0) {
          const newStack: HistoryEntry[] = [];
          if (!options.skipCallbacks) {
            onRedoStackChange?.(newStack);
          }
          return newStack;
        }
        return prevStack;
      });
    },
    [normalizedLimit, onUndoStackChange, onRedoStackChange],
  );

  // Undo operation
  const undo = useCallback(
    (options: HistoryOperationOptions = {}): HistoryEntry | null => {
      // Use current undoStack state to determine if we can undo
      const currentUndoStack = undoStack;
      if (currentUndoStack.length === 0) {
        return null;
      }

      const lastEntry = currentUndoStack[currentUndoStack.length - 1];

      setUndoStackState((prevStack) => {
        const newStack = prevStack.slice(0, -1);
        if (!options.skipCallbacks) {
          onUndoStackChange?.(newStack);
        }
        return newStack;
      });

      setRedoStackState((prevStack) => {
        const newStack = [...prevStack, lastEntry];
        if (!options.skipCallbacks) {
          onRedoStackChange?.(newStack);
        }
        return newStack;
      });

      return lastEntry;
    },
    [undoStack, onUndoStackChange, onRedoStackChange],
  );

  // Redo operation
  const redo = useCallback(
    (options: HistoryOperationOptions = {}): HistoryEntry | null => {
      // Use current redoStack state to determine if we can redo
      const currentRedoStack = redoStack;
      if (currentRedoStack.length === 0) {
        return null;
      }

      const lastEntry = currentRedoStack[currentRedoStack.length - 1];

      setRedoStackState((prevStack) => {
        const newStack = prevStack.slice(0, -1);
        if (!options.skipCallbacks) {
          onRedoStackChange?.(newStack);
        }
        return newStack;
      });

      setUndoStackState((prevStack) => {
        const newStack = [...prevStack, lastEntry];
        if (!options.skipCallbacks) {
          onUndoStackChange?.(newStack);
        }
        return newStack;
      });

      return lastEntry;
    },
    [redoStack, onUndoStackChange, onRedoStackChange],
  );

  // Clear undo stack
  const clearUndoStack = useCallback(
    (options: HistoryOperationOptions = {}): void => {
      setUndoStackState(() => {
        const newStack: HistoryEntry[] = [];
        if (!options.skipCallbacks) {
          onUndoStackChange?.(newStack);
        }
        return newStack;
      });
    },
    [onUndoStackChange],
  );

  // Clear redo stack
  const clearRedoStack = useCallback(
    (options: HistoryOperationOptions = {}): void => {
      setRedoStackState(() => {
        const newStack: HistoryEntry[] = [];
        if (!options.skipCallbacks) {
          onRedoStackChange?.(newStack);
        }
        return newStack;
      });
    },
    [onRedoStackChange],
  );

  // Clear both stacks
  const clearHistory = useCallback(
    (options: HistoryOperationOptions = {}): void => {
      setUndoStackState(() => {
        const newStack: HistoryEntry[] = [];
        if (!options.skipCallbacks) {
          onUndoStackChange?.(newStack);
        }
        return newStack;
      });

      setRedoStackState(() => {
        const newStack: HistoryEntry[] = [];
        if (!options.skipCallbacks) {
          onRedoStackChange?.(newStack);
        }
        return newStack;
      });
    },
    [onUndoStackChange, onRedoStackChange],
  );

  // Computed properties
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    // Core state
    undoStack,
    redoStack,
    canUndo,
    canRedo,

    // History operations
    pushUndo,
    undo,
    redo,

    // Stack management
    clearUndoStack,
    clearRedoStack,
    clearHistory,
  };
}
