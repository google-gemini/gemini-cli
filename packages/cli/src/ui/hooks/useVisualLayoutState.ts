/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  calculateVisualLayout,
  type VisualLayout,
} from '../utils/text-buffer-utils.js';

/**
 * Configuration options for useVisualLayoutState hook
 */
export interface UseVisualLayoutStateOptions {
  /** Array of logical text lines */
  logicalLines: string[];
  /** Current logical cursor position [row, col] */
  logicalCursor: [number, number];
  /** Viewport width for wrapping calculations */
  viewportWidth: number;
  /** Viewport height for scrolling calculations */
  viewportHeight?: number;
  /** Initial visual scroll row position */
  initialVisualScrollRow?: number;
  /** Callback fired when visual scroll position changes */
  onVisualScrollChange?: (scrollRow: number) => void;
  /** Callback fired when layout recalculates */
  onLayoutChange?: (layout: VisualLayout) => void;
}

/**
 * Return type for useVisualLayoutState hook
 */
export interface UseVisualLayoutStateReturn {
  // Core visual state
  visualLines: string[];
  visualCursor: [number, number];
  visualScrollRow: number;
  logicalToVisualMap: Array<Array<[number, number]>>;
  visualToLogicalMap: Array<[number, number]>;

  // Scroll operations
  setVisualScrollRow: (row: number) => void;

  // Viewport utilities
  getVisibleVisualLines: () => string[];
  isVisualLineVisible: (visualRow: number) => boolean;
  getVisualCursorRelativeToViewport: () => [number, number];

  // Position mapping utilities
  visualToLogical: (
    visualRow: number,
    visualCol: number,
  ) => [number, number] | null;
  logicalToVisual: (
    logicalRow: number,
    logicalCol: number,
  ) => [number, number] | null;
}

/**
 * Utility function to clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Custom hook for managing visual layout state (wrapped lines, visual cursor, scroll position).
 *
 * Handles text wrapping, cursor mapping between logical and visual coordinates,
 * and viewport scrolling. Integrates with existing visual layout utilities while
 * providing coordination with other state domains through callback patterns.
 */
export function useVisualLayoutState({
  logicalLines,
  logicalCursor,
  viewportWidth,
  viewportHeight = 25,
  initialVisualScrollRow = 0,
  onVisualScrollChange,
  onLayoutChange,
}: UseVisualLayoutStateOptions): UseVisualLayoutStateReturn {
  // Visual scroll state - clamp initial value to prevent invalid positions
  const [visualScrollRow, setVisualScrollRowState] = useState<number>(
    () =>
      // For initial state, we can't clamp yet because layout hasn't been calculated
      initialVisualScrollRow,
  );

  // Calculate visual layout using existing utility
  const layout = useMemo(() => {
    const normalizedLines = logicalLines.length === 0 ? [''] : logicalLines;
    return calculateVisualLayout(normalizedLines, logicalCursor, viewportWidth);
  }, [logicalLines, logicalCursor, viewportWidth]);

  // Update layout callback when layout changes
  // Use useRef to track if this is the initial render to avoid calling on every render
  const isInitialRender = useRef(true);
  const prevLayout = useRef(layout);

  useEffect(() => {
    // Only call onLayoutChange if layout actually changed (not just a rerender)
    if (!isInitialRender.current && layout !== prevLayout.current) {
      onLayoutChange?.(layout);
    } else if (isInitialRender.current) {
      isInitialRender.current = false;
      onLayoutChange?.(layout);
    }
    prevLayout.current = layout;
  }, [layout, onLayoutChange]);

  // Track previous cursor position to enable auto-scroll only when cursor actually moves
  const [prevCursorPosition, setPrevCursorPosition] =
    useState<[number, number]>(logicalCursor);

  useEffect(() => {
    const cursorVisualRow = layout.visualCursor[0];
    const currentLogicalCursor = logicalCursor;

    // Only auto-scroll if the logical cursor position actually changed
    const cursorMoved =
      currentLogicalCursor[0] !== prevCursorPosition[0] ||
      currentLogicalCursor[1] !== prevCursorPosition[1];

    if (cursorMoved) {
      setPrevCursorPosition(currentLogicalCursor);

      let newScrollRow = visualScrollRow;

      // Scroll up if cursor is above viewport
      if (cursorVisualRow < visualScrollRow) {
        newScrollRow = cursorVisualRow;
      }
      // Scroll down if cursor is below viewport
      else if (cursorVisualRow >= visualScrollRow + viewportHeight) {
        newScrollRow = cursorVisualRow - viewportHeight + 1;
      }

      // Clamp scroll position to valid bounds
      const maxScrollRow = Math.max(
        0,
        layout.visualLines.length - viewportHeight,
      );
      newScrollRow = clamp(newScrollRow, 0, maxScrollRow);

      if (newScrollRow !== visualScrollRow) {
        setVisualScrollRowState(newScrollRow);
        onVisualScrollChange?.(newScrollRow);
      }
    }
  }, [
    layout.visualCursor,
    layout.visualLines.length,
    visualScrollRow,
    viewportHeight,
    onVisualScrollChange,
    logicalCursor,
    prevCursorPosition,
  ]);

  // Scroll operations
  const setVisualScrollRow = useCallback(
    (row: number): void => {
      const maxScrollRow = Math.max(
        0,
        layout.visualLines.length - viewportHeight,
      );
      const clampedRow = clamp(row, 0, maxScrollRow);

      setVisualScrollRowState(clampedRow);
      onVisualScrollChange?.(clampedRow);
    },
    [layout.visualLines.length, viewportHeight, onVisualScrollChange],
  );

  // Viewport utilities
  const getVisibleVisualLines = useCallback((): string[] => {
    const startRow = visualScrollRow;
    const endRow = startRow + viewportHeight;
    return layout.visualLines.slice(startRow, endRow);
  }, [layout.visualLines, visualScrollRow, viewportHeight]);

  const isVisualLineVisible = useCallback(
    (visualRow: number): boolean =>
      visualRow >= visualScrollRow &&
      visualRow < visualScrollRow + viewportHeight,
    [visualScrollRow, viewportHeight],
  );

  const getVisualCursorRelativeToViewport = useCallback((): [
    number,
    number,
  ] => {
    const [absoluteRow, col] = layout.visualCursor;
    const relativeRow = absoluteRow - visualScrollRow;
    return [relativeRow, col];
  }, [layout.visualCursor, visualScrollRow]);

  // Position mapping utilities
  const visualToLogical = useCallback(
    (visualRow: number, visualCol: number): [number, number] | null => {
      if (visualRow < 0 || visualRow >= layout.visualToLogicalMap.length) {
        return null;
      }

      const [logicalRow, logicalStartCol] =
        layout.visualToLogicalMap[visualRow];
      const logicalCol = logicalStartCol + visualCol;

      return [logicalRow, logicalCol];
    },
    [layout.visualToLogicalMap],
  );

  const logicalToVisual = useCallback(
    (logicalRow: number, logicalCol: number): [number, number] | null => {
      if (logicalRow < 0 || logicalRow >= layout.logicalToVisualMap.length) {
        return null;
      }

      const logicalLineMap = layout.logicalToVisualMap[logicalRow];
      if (!logicalLineMap || logicalLineMap.length === 0) {
        return null;
      }

      // Find the correct visual line for this logical position
      for (let i = 0; i < logicalLineMap.length; i++) {
        const [visualRow, logicalStartCol] = logicalLineMap[i];
        const nextMapping = logicalLineMap[i + 1];

        if (nextMapping) {
          const [, nextLogicalStartCol] = nextMapping;
          if (
            logicalCol >= logicalStartCol &&
            logicalCol < nextLogicalStartCol
          ) {
            return [visualRow, logicalCol - logicalStartCol];
          }
        } else {
          // Last mapping for this logical line
          if (logicalCol >= logicalStartCol) {
            return [visualRow, logicalCol - logicalStartCol];
          }
        }
      }

      // Fallback to first mapping if not found
      const [firstVisualRow, firstLogicalStartCol] = logicalLineMap[0];
      return [firstVisualRow, Math.max(0, logicalCol - firstLogicalStartCol)];
    },
    [layout.logicalToVisualMap],
  );

  return {
    // Core visual state
    visualLines: layout.visualLines,
    visualCursor: layout.visualCursor,
    visualScrollRow,
    logicalToVisualMap: layout.logicalToVisualMap,
    visualToLogicalMap: layout.visualToLogicalMap,

    // Scroll operations
    setVisualScrollRow,

    // Viewport utilities
    getVisibleVisualLines,
    isVisualLineVisible,
    getVisualCursorRelativeToViewport,

    // Position mapping utilities
    visualToLogical,
    logicalToVisual,
  };
}
