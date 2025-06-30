/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * Position type for text coordinates [row, col]
 */
export type Position = [number, number];

/**
 * Configuration options for useSelectionState hook
 */
export interface UseSelectionStateOptions {
  /** Initial selection anchor position */
  initialSelectionAnchor?: Position | null;
  /** Initial selection extent position */
  initialSelectionExtent?: Position | null;
  /** Initial clipboard content */
  initialClipboardContent?: string;
  /** Callback fired when selection changes */
  onSelectionChange?: (
    anchor: Position | null,
    extent: Position | null,
  ) => void;
  /** Callback fired when clipboard content changes */
  onClipboardChange?: (content: string) => void;
  /** Callback fired when text is cut from selection */
  onCutText?: (start: Position, end: Position) => void;
}

/**
 * Options for selection operations
 */
export interface SelectionOperationOptions {
  /** Skip firing callbacks for this operation */
  skipCallbacks?: boolean;
}

/**
 * Selection bounds result
 */
export interface SelectionBounds {
  start: Position;
  end: Position;
}

/**
 * Return type for useSelectionState hook
 */
export interface UseSelectionStateReturn {
  // Core selection state
  selectionAnchor: Position | null;
  selectionExtent: Position | null;
  hasSelection: boolean;
  clipboardContent: string;

  // Selection operations
  setSelection: (
    anchor: Position | null,
    extent: Position | null,
    options?: SelectionOperationOptions,
  ) => void;
  setSelectionAnchor: (
    anchor: Position | null,
    options?: SelectionOperationOptions,
  ) => void;
  setSelectionExtent: (
    extent: Position | null,
    options?: SelectionOperationOptions,
  ) => void;
  clearSelection: (options?: SelectionOperationOptions) => void;

  // Selection utilities
  getSelectionBounds: () => SelectionBounds | null;
  isPositionInSelection: (position: Position) => boolean;
  getSelectedText: (lines: string[]) => string;

  // Clipboard operations
  copyToClipboard: (
    lines: string[],
    options?: SelectionOperationOptions,
  ) => void;
  cutToClipboard: (
    lines: string[],
    options?: SelectionOperationOptions,
  ) => void;
  setClipboardContent: (
    content: string,
    options?: SelectionOperationOptions,
  ) => void;

  // Special selection operations
  selectAll: (
    lineCount: number,
    lastLineLength: number,
    options?: SelectionOperationOptions,
  ) => void;
  selectLine: (
    lineIndex: number,
    lineLength: number,
    options?: SelectionOperationOptions,
  ) => void;
  selectWord: (
    position: Position,
    wordStart: Position,
    wordEnd: Position,
    options?: SelectionOperationOptions,
  ) => void;
}

/**
 * Utility function to compare two positions
 */
function comparePositions(pos1: Position, pos2: Position): number {
  if (pos1[0] !== pos2[0]) {
    return pos1[0] - pos2[0]; // Compare rows
  }
  return pos1[1] - pos2[1]; // Compare columns
}

/**
 * Utility function to check if two positions are equal
 */
function positionsEqual(pos1: Position | null, pos2: Position | null): boolean {
  if (pos1 === null && pos2 === null) return true;
  if (pos1 === null || pos2 === null) return false;
  return pos1[0] === pos2[0] && pos1[1] === pos2[1];
}

/**
 * Utility function to check if a position is between two other positions (inclusive)
 */
function isPositionBetween(
  pos: Position,
  start: Position,
  end: Position,
): boolean {
  return comparePositions(pos, start) >= 0 && comparePositions(pos, end) <= 0;
}

/**
 * Custom hook for managing text selection state (anchor, extent, clipboard).
 *
 * Provides isolated selection management with clipboard operations and
 * position-based selection handling. Maintains selection anchor and extent
 * positions while enabling coordination with other state domains through
 * callback patterns.
 */
export function useSelectionState({
  initialSelectionAnchor = null,
  initialSelectionExtent = null,
  initialClipboardContent = '',
  onSelectionChange,
  onClipboardChange,
  onCutText,
}: UseSelectionStateOptions = {}): UseSelectionStateReturn {
  // Validate initial selection - if only one is provided, clear both
  const validatedInitialAnchor =
    initialSelectionAnchor && initialSelectionExtent
      ? initialSelectionAnchor
      : null;
  const validatedInitialExtent =
    initialSelectionAnchor && initialSelectionExtent
      ? initialSelectionExtent
      : null;

  // Selection state
  const [selectionAnchor, setSelectionAnchorState] = useState<Position | null>(
    validatedInitialAnchor,
  );
  const [selectionExtent, setSelectionExtentState] = useState<Position | null>(
    validatedInitialExtent,
  );

  // Clipboard state
  const [clipboardContent, setClipboardContentState] = useState<string>(
    initialClipboardContent,
  );

  // Computed property: hasSelection (both anchor and extent must be set and different)
  const hasSelection = useMemo(
    () =>
      selectionAnchor !== null &&
      selectionExtent !== null &&
      !positionsEqual(selectionAnchor, selectionExtent),
    [selectionAnchor, selectionExtent],
  );

  // Set both anchor and extent
  const setSelection = useCallback(
    (
      anchor: Position | null,
      extent: Position | null,
      options: SelectionOperationOptions = {},
    ): void => {
      setSelectionAnchorState(anchor);
      setSelectionExtentState(extent);

      if (!options.skipCallbacks) {
        onSelectionChange?.(anchor, extent);
      }
    },
    [onSelectionChange],
  );

  // Set selection anchor
  const setSelectionAnchor = useCallback(
    (
      anchor: Position | null,
      options: SelectionOperationOptions = {},
    ): void => {
      setSelectionAnchorState(anchor);

      // Only fire callback if we now have a complete selection
      if (
        !options.skipCallbacks &&
        anchor !== null &&
        selectionExtent !== null
      ) {
        onSelectionChange?.(anchor, selectionExtent);
      }
    },
    [selectionExtent, onSelectionChange],
  );

  // Set selection extent
  const setSelectionExtent = useCallback(
    (
      extent: Position | null,
      options: SelectionOperationOptions = {},
    ): void => {
      setSelectionExtentState(extent);

      // Only fire callback if we now have a complete selection
      if (
        !options.skipCallbacks &&
        extent !== null &&
        selectionAnchor !== null
      ) {
        onSelectionChange?.(selectionAnchor, extent);
      }
    },
    [selectionAnchor, onSelectionChange],
  );

  // Clear selection
  const clearSelection = useCallback(
    (options: SelectionOperationOptions = {}): void => {
      setSelectionAnchorState(null);
      setSelectionExtentState(null);

      if (!options.skipCallbacks) {
        onSelectionChange?.(null, null);
      }
    },
    [onSelectionChange],
  );

  // Get selection bounds (normalized start and end positions)
  const getSelectionBounds = useCallback((): SelectionBounds | null => {
    if (!hasSelection || !selectionAnchor || !selectionExtent) {
      return null;
    }

    const cmp = comparePositions(selectionAnchor, selectionExtent);
    if (cmp <= 0) {
      return { start: selectionAnchor, end: selectionExtent };
    } else {
      return { start: selectionExtent, end: selectionAnchor };
    }
  }, [hasSelection, selectionAnchor, selectionExtent]);

  // Check if position is within selection
  const isPositionInSelection = useCallback(
    (position: Position): boolean => {
      const bounds = getSelectionBounds();
      if (!bounds) {
        return false;
      }

      return isPositionBetween(position, bounds.start, bounds.end);
    },
    [getSelectionBounds],
  );

  // Get selected text from provided lines
  const getSelectedText = useCallback(
    (lines: string[]): string => {
      const bounds = getSelectionBounds();
      if (!bounds || lines.length === 0) {
        return '';
      }

      const { start, end } = bounds;

      // Single line selection
      if (start[0] === end[0]) {
        const line = lines[start[0]];
        if (!line) return '';
        return line.slice(start[1], end[1]);
      }

      // Multi-line selection
      const result: string[] = [];

      for (let row = start[0]; row <= end[0]; row++) {
        const line = lines[row];
        if (!line) continue;

        if (row === start[0]) {
          // First line - from start column to end
          result.push(line.slice(start[1]));
        } else if (row === end[0]) {
          // Last line - from beginning to end column
          result.push(line.slice(0, end[1]));
        } else {
          // Middle line - entire line
          result.push(line);
        }
      }

      return result.join('\n');
    },
    [getSelectionBounds],
  );

  // Copy selected text to clipboard
  const copyToClipboard = useCallback(
    (lines: string[], options: SelectionOperationOptions = {}): void => {
      if (!hasSelection) {
        return;
      }

      const selectedText = getSelectedText(lines);
      setClipboardContentState(selectedText);

      if (!options.skipCallbacks) {
        onClipboardChange?.(selectedText);
      }
    },
    [hasSelection, getSelectedText, onClipboardChange],
  );

  // Cut selected text to clipboard
  const cutToClipboard = useCallback(
    (lines: string[], options: SelectionOperationOptions = {}): void => {
      if (!hasSelection) {
        return;
      }

      const bounds = getSelectionBounds();
      if (!bounds) {
        return;
      }

      const selectedText = getSelectedText(lines);
      setClipboardContentState(selectedText);

      if (!options.skipCallbacks) {
        onClipboardChange?.(selectedText);
        onCutText?.(bounds.start, bounds.end);
      }

      // Clear selection after cut
      clearSelection(options);
    },
    [
      hasSelection,
      getSelectionBounds,
      getSelectedText,
      onClipboardChange,
      onCutText,
      clearSelection,
    ],
  );

  // Set clipboard content directly
  const setClipboardContent = useCallback(
    (content: string, options: SelectionOperationOptions = {}): void => {
      setClipboardContentState(content);

      if (!options.skipCallbacks) {
        onClipboardChange?.(content);
      }
    },
    [onClipboardChange],
  );

  // Select all text
  const selectAll = useCallback(
    (
      lineCount: number,
      lastLineLength: number,
      options: SelectionOperationOptions = {},
    ): void => {
      const anchor: Position = [0, 0];
      const extent: Position = [Math.max(0, lineCount - 1), lastLineLength];

      setSelection(anchor, extent, options);
    },
    [setSelection],
  );

  // Select entire line
  const selectLine = useCallback(
    (
      lineIndex: number,
      lineLength: number,
      options: SelectionOperationOptions = {},
    ): void => {
      const anchor: Position = [lineIndex, 0];
      const extent: Position = [lineIndex, lineLength];

      setSelection(anchor, extent, options);
    },
    [setSelection],
  );

  // Select word at position
  const selectWord = useCallback(
    (
      position: Position,
      wordStart: Position,
      wordEnd: Position,
      options: SelectionOperationOptions = {},
    ): void => {
      void position; // Position parameter provided for future extensibility
      setSelection(wordStart, wordEnd, options);
    },
    [setSelection],
  );

  return {
    // Core selection state
    selectionAnchor,
    selectionExtent,
    hasSelection,
    clipboardContent,

    // Selection operations
    setSelection,
    setSelectionAnchor,
    setSelectionExtent,
    clearSelection,

    // Selection utilities
    getSelectionBounds,
    isPositionInSelection,
    getSelectedText,

    // Clipboard operations
    copyToClipboard,
    cutToClipboard,
    setClipboardContent,

    // Special selection operations
    selectAll,
    selectLine,
    selectWord,
  };
}
