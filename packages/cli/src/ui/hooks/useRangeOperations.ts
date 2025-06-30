/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { cpLen, cpSlice } from '../utils/textUtils.js';
import { clamp, offsetToLogicalPos } from '../utils/text-buffer-utils.js';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type { UseHistoryStateReturn, HistoryEntry } from './useHistoryState.js';

// Common Array/Index Constants
const INDICES = {
  /** Index for first element or start position */
  START: 0,
  /** Single step increment/decrement */
  SINGLE_STEP: 1,
} as const;

/**
 * Configuration options for useRangeOperations hook
 */
export interface UseRangeOperationsOptions {
  /** Skip firing callbacks for operations */
  skipCallbacks?: boolean;
}

/**
 * Return type for useRangeOperations hook
 */
export interface UseRangeOperationsReturn {
  // Range replacement operations
  replaceRange: (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    replacementText: string,
  ) => boolean;
  replaceRangeByOffset: (
    startOffset: number,
    endOffset: number,
    replacementText: string,
  ) => boolean;

  // Full text replacement
  setText: (text: string) => void;
}

/**
 * Custom hook for managing range-based text operations.
 *
 * Provides range replacement and full text replacement operations that coordinate
 * with logical text state and history management. Handles complex text replacement
 * scenarios including multi-line ranges while maintaining consistency with the
 * underlying state management hooks.
 */
export function useRangeOperations(
  logicalState: UseLogicalTextStateReturn,
  historyState: UseHistoryStateReturn,
  options: UseRangeOperationsOptions = {},
): UseRangeOperationsReturn {
  // Create history snapshot from current state
  const createHistorySnapshot = useCallback(
    (): HistoryEntry => ({
      lines: [...logicalState.lines],
      cursorRow: logicalState.cursorRow,
      cursorCol: logicalState.cursorCol,
    }),
    [logicalState.lines, logicalState.cursorRow, logicalState.cursorCol],
  );

  // Replace text within a specified range
  const replaceRange = useCallback(
    (
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      replacementText: string,
    ): boolean => {
      // Validate range
      if (
        startRow > endRow ||
        (startRow === endRow && startCol > endCol) ||
        startRow < INDICES.START ||
        startCol < INDICES.START ||
        endRow >= logicalState.lines.length ||
        (endRow < logicalState.lines.length &&
          endCol > cpLen(logicalState.lines[endRow] ?? ''))
      ) {
        console.error('Invalid range provided to replaceRange', {
          startRow,
          startCol,
          endRow,
          endCol,
          linesLength: logicalState.lines.length,
          endRowLineLength: cpLen(logicalState.lines[endRow] ?? ''),
        });
        return false;
      }

      // Push undo before making changes
      const snapshot = createHistorySnapshot();
      historyState.pushUndo(snapshot, { skipCallbacks: options.skipCallbacks });

      // Clamp coordinates to valid ranges
      const currentLine = (row: number) => logicalState.lines[row] ?? '';
      const currentLineLen = (row: number) => cpLen(currentLine(row));

      const sCol = clamp(startCol, INDICES.START, currentLineLen(startRow));
      const eCol = clamp(endCol, INDICES.START, currentLineLen(endRow));

      // Extract prefix and suffix
      const prefix = cpSlice(currentLine(startRow), INDICES.START, sCol);
      const suffix = cpSlice(currentLine(endRow), eCol);

      // Normalize replacement text line endings
      const normalizedReplacement = replacementText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      const replacementParts = normalizedReplacement.split('\n');

      // Build new lines array
      const newLines = [...logicalState.lines];

      // Remove lines between startRow and endRow (exclusive of startRow, inclusive of endRow if different)
      if (startRow < endRow) {
        newLines.splice(startRow + INDICES.SINGLE_STEP, endRow - startRow);
      }

      // Construct the new content for the startRow
      newLines[startRow] = prefix + replacementParts[INDICES.START];

      let newCursorRow = startRow;
      let newCursorCol = cpLen(prefix) + cpLen(replacementParts[INDICES.START]);

      // If replacementText has multiple lines, insert them
      if (replacementParts.length > INDICES.SINGLE_STEP) {
        const lastReplacementPart = replacementParts.pop() ?? '';

        // Insert middle parts (if any)
        if (replacementParts.length > INDICES.SINGLE_STEP) {
          newLines.splice(
            startRow + INDICES.SINGLE_STEP,
            INDICES.START,
            ...replacementParts.slice(INDICES.SINGLE_STEP),
          );
        }

        // The line where the last part of the replacement will go
        const targetRowForLastPart =
          startRow + (replacementParts.length - INDICES.SINGLE_STEP);

        // Handle the last part
        if (
          targetRowForLastPart > startRow ||
          (replacementParts.length === INDICES.SINGLE_STEP &&
            lastReplacementPart !== '')
        ) {
          if (
            newLines[targetRowForLastPart] === undefined &&
            targetRowForLastPart === startRow + INDICES.SINGLE_STEP &&
            replacementParts.length === INDICES.SINGLE_STEP
          ) {
            // Single line replacement that became two lines
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

        newCursorRow = targetRowForLastPart;
        newCursorCol = cpLen(newLines[targetRowForLastPart]) - cpLen(suffix);
      } else {
        // Single line replacement
        newLines[startRow] += suffix;
        newCursorCol = cpLen(prefix) + cpLen(replacementParts[INDICES.START]);
      }

      // Update state
      logicalState.setLines(newLines);
      logicalState.setCursor(newCursorRow, newCursorCol);
      logicalState.setPreferredCol(null);

      return true;
    },
    [logicalState, historyState, createHistorySnapshot, options.skipCallbacks],
  );

  // Replace range by character offset
  const replaceRangeByOffset = useCallback(
    (
      startOffset: number,
      endOffset: number,
      replacementText: string,
    ): boolean => {
      const text = logicalState.lines.join('\n');
      const [startRow, startCol] = offsetToLogicalPos(text, startOffset);
      const [endRow, endCol] = offsetToLogicalPos(text, endOffset);

      return replaceRange(startRow, startCol, endRow, endCol, replacementText);
    },
    [logicalState.lines, replaceRange],
  );

  // Set entire text content
  const setText = useCallback(
    (newText: string): void => {
      // Push undo before making changes
      const snapshot = createHistorySnapshot();
      historyState.pushUndo(snapshot, { skipCallbacks: options.skipCallbacks });

      // Normalize line endings and split into lines
      const normalizedText = (newText || '').replace(/\r\n?/g, '\n');
      const newContentLines = normalizedText.split('\n');

      // Ensure at least one line
      const finalLines =
        newContentLines.length === INDICES.START ? [''] : newContentLines;

      // Update lines
      logicalState.setLines(finalLines);

      // Set cursor to end of new text
      const lastLineIndex = finalLines.length - INDICES.SINGLE_STEP;
      const lastLineLength = cpLen(finalLines[lastLineIndex] ?? '');
      logicalState.setCursor(lastLineIndex, lastLineLength);
      logicalState.setPreferredCol(null);
    },
    [logicalState, historyState, createHistorySnapshot, options.skipCallbacks],
  );

  return {
    replaceRange,
    replaceRangeByOffset,
    setText,
  };
}
