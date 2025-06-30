/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { toCodePoints } from '../utils/textUtils.js';
import { stripUnsafeCharacters } from '../utils/text-buffer-utils.js';
import { unescapePath } from '@google/gemini-cli-core';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type { UseHistoryStateReturn, HistoryEntry } from './useHistoryState.js';

// ASCII Character Codes
const ASCII_CODES = {
  /** ASCII DELETE character (0x7F) - breaks terminal rendering */
  DELETE: 127,
  /** ASCII Line Feed character (\n) */
  LINE_FEED: 10,
  /** ASCII Carriage Return character (\r) */
  CARRIAGE_RETURN: 13,
} as const;

// Text Processing Constants
const TEXT_PROCESSING = {
  /** Minimum string length to consider for drag-and-drop file path detection */
  MIN_DRAG_DROP_PATH_LENGTH: 3,
  /** Minimum quote-wrapped path length for path extraction */
  MIN_QUOTED_PATH_LENGTH: 2,
} as const;

// String Processing Constants
const STRING_PROCESSING = {
  /** Index offset for removing first character from string */
  REMOVE_FIRST_CHAR: 1,
  /** Index offset for removing last character from string */
  REMOVE_LAST_CHAR: -1,
} as const;

// Common Array/Index Constants
const INDICES = {
  /** Index for first element or start position */
  START: 0,
  /** Single step increment/decrement */
  SINGLE_STEP: 1,
} as const;

/**
 * Update operation types for batch text operations
 */
export type UpdateOperation =
  | { type: 'insert'; payload: string }
  | { type: 'backspace' };

/**
 * Configuration options for useTextOperations hook
 */
export interface UseTextOperationsOptions {
  /** Skip firing callbacks for operations */
  skipCallbacks?: boolean;
}

/**
 * Return type for useTextOperations hook
 */
export interface UseTextOperationsReturn {
  // Basic text operations
  insertStr: (str: string) => boolean;
  insert: (ch: string) => void;
  newline: () => void;
  backspace: () => void;
  del: () => void;

  // Batch operations
  applyOperations: (ops: UpdateOperation[]) => void;
}

/**
 * Normalizes text by converting various line ending formats to \n and stripping unsafe characters.
 * This ensures consistent text handling across different platforms and input sources.
 */
function normalizeText(str: string): string {
  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return stripUnsafeCharacters(normalized);
}

/**
 * Custom hook for managing text input operations.
 *
 * Provides text manipulation operations that coordinate with logical text state
 * and history management. Handles text insertion, deletion, and batch operations
 * while maintaining consistency with the underlying state management hooks.
 */
export function useTextOperations(
  logicalState: UseLogicalTextStateReturn,
  historyState: UseHistoryStateReturn,
  isValidPath: (path: string) => boolean,
  options: UseTextOperationsOptions = {},
): UseTextOperationsReturn {
  // Create history snapshot from current state
  const createHistorySnapshot = useCallback(
    (): HistoryEntry => ({
      lines: [...logicalState.lines],
      cursorRow: logicalState.cursorRow,
      cursorCol: logicalState.cursorCol,
    }),
    [logicalState.lines, logicalState.cursorRow, logicalState.cursorCol],
  );

  // Apply batch operations
  const applyOperations = useCallback(
    (ops: UpdateOperation[]): void => {
      if (ops.length === INDICES.START) return;

      // Expand operations to handle DELETE characters
      const expandedOps: UpdateOperation[] = [];
      for (const op of ops) {
        if (op.type === 'insert') {
          let currentText = '';
          for (const char of toCodePoints(op.payload)) {
            if (char.codePointAt(0) === ASCII_CODES.DELETE) {
              // \x7f - flush current text and add backspace
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

      // Push undo before applying batch
      const snapshot = createHistorySnapshot();
      historyState.pushUndo(snapshot);

      // Apply each operation
      for (const op of expandedOps) {
        if (op.type === 'insert') {
          const normalizedText = normalizeText(op.payload);
          logicalState.insertText(normalizedText, {
            skipCallbacks: options.skipCallbacks,
          });
        } else if (op.type === 'backspace') {
          if (
            logicalState.cursorCol === INDICES.START &&
            logicalState.cursorRow === INDICES.START
          ) {
            continue;
          }
          logicalState.deleteCharBefore({
            skipCallbacks: options.skipCallbacks,
          });
        }
      }

      logicalState.setPreferredCol(null);
    },
    [logicalState, historyState, createHistorySnapshot, options.skipCallbacks],
  );

  // Insert string (handles multi-line text)
  const insertStr = useCallback(
    (str: string): boolean => {
      if (str === '') return false;

      // Push undo before making changes
      const snapshot = createHistorySnapshot();
      historyState.pushUndo(snapshot);

      // Normalize text and insert
      const normalizedText = normalizeText(str);
      logicalState.insertText(normalizedText, {
        skipCallbacks: options.skipCallbacks,
      });
      logicalState.setPreferredCol(null);

      return true;
    },
    [logicalState, historyState, createHistorySnapshot, options.skipCallbacks],
  );

  // Insert single character or string
  const insert = useCallback(
    (ch: string): void => {
      // Handle newlines with insertStr
      if (/[\n\r]/.test(ch)) {
        insertStr(ch);
        return;
      }

      // Strip unsafe characters
      ch = stripUnsafeCharacters(ch);

      // Handle potential file path drag-and-drop
      const minLengthToInferAsDragDrop =
        TEXT_PROCESSING.MIN_DRAG_DROP_PATH_LENGTH;
      if (ch.length >= minLengthToInferAsDragDrop) {
        let potentialPath = ch;

        // Handle quoted paths
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

        // Be conservative and only add an @ if the path is valid
        if (isValidPath(unescapePath(potentialPath))) {
          ch = `@${potentialPath}`;
        }
      }

      // Apply as batch operation
      applyOperations([{ type: 'insert', payload: ch }]);
    },
    [insertStr, isValidPath, applyOperations],
  );

  // Insert newline
  const newline = useCallback((): void => {
    applyOperations([{ type: 'insert', payload: '\n' }]);
  }, [applyOperations]);

  // Backspace operation
  const backspace = useCallback((): void => {
    // Check if at start of document
    if (
      logicalState.cursorCol === INDICES.START &&
      logicalState.cursorRow === INDICES.START
    ) {
      return;
    }

    applyOperations([{ type: 'backspace' }]);
  }, [logicalState.cursorRow, logicalState.cursorCol, applyOperations]);

  // Delete operation
  const del = useCallback((): void => {
    // Push undo before making changes
    const snapshot = createHistorySnapshot();
    historyState.pushUndo(snapshot);

    // Use logical state's delete functionality
    logicalState.deleteCharAfter({ skipCallbacks: options.skipCallbacks });
    logicalState.setPreferredCol(null);
  }, [
    logicalState,
    historyState,
    createHistorySnapshot,
    options.skipCallbacks,
  ]);

  return {
    insertStr,
    insert,
    newline,
    backspace,
    del,
    applyOperations,
  };
}
