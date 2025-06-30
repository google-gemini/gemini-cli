/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cpLen, cpSlice } from '../../utils/textUtils.js';

/**
 * Common context interface for all movement operations
 */
export interface MovementContext {
  visualLines: string[];
  visualCursor: [number, number];
  preferredCol: number | null;
  lines: string[];
  currentLineLen: (row: number) => number;
  visualToLogicalMap: Array<[number, number] | undefined>;
  logicalToVisualMap: Array<Array<[number, number]>>;
}

/**
 * Result of a movement operation
 */
export interface MovementResult {
  newVisualRow: number;
  newVisualCol: number;
  newPreferredCol: number | null;
}

/**
 * Type for movement function implementations
 */
export type MovementFunction = (context: MovementContext) => MovementResult;

/**
 * Utility function to clamp a value between min and max
 */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Move cursor one position to the left
 * - If not at start of visual line: move left one column
 * - If at start of visual line: move to end of previous visual line
 * - Resets preferred column (horizontal movement)
 */
export const moveLeft: MovementFunction = (context) => {
  const { visualLines, visualCursor } = context;
  let [newVisualRow, newVisualCol] = visualCursor;

  if (newVisualCol > 0) {
    newVisualCol--;
  } else if (newVisualRow > 0) {
    newVisualRow--;
    newVisualCol = cpLen(visualLines[newVisualRow] ?? '');
  }

  return {
    newVisualRow,
    newVisualCol,
    newPreferredCol: null, // Reset on horizontal movement
  };
};

/**
 * Move cursor one position to the right
 * - If not at end of visual line: move right one column
 * - If at end of visual line: move to start of next visual line
 * - Resets preferred column (horizontal movement)
 */
export const moveRight: MovementFunction = (context) => {
  const { visualLines, visualCursor } = context;
  let [newVisualRow, newVisualCol] = visualCursor;

  const currentVisLineLen = cpLen(visualLines[newVisualRow] ?? '');

  if (newVisualCol < currentVisLineLen) {
    newVisualCol++;
  } else if (newVisualRow < visualLines.length - 1) {
    newVisualRow++;
    newVisualCol = 0;
  }

  return {
    newVisualRow,
    newVisualCol,
    newPreferredCol: null, // Reset on horizontal movement
  };
};

/**
 * Move cursor up one visual line
 * - If not on first line: move up one visual line
 * - Maintains or sets preferred column for consistent vertical navigation
 * - Clamps to line length if preferred column exceeds line
 */
export const moveUp: MovementFunction = (context) => {
  const { visualLines, visualCursor, preferredCol } = context;
  let [newVisualRow, newVisualCol] = visualCursor;
  let newPreferredCol = preferredCol;

  if (newVisualRow > 0) {
    if (newPreferredCol === null) {
      newPreferredCol = newVisualCol;
    }
    newVisualRow--;
    newVisualCol = clamp(
      newPreferredCol,
      0,
      cpLen(visualLines[newVisualRow] ?? ''),
    );
  }

  return {
    newVisualRow,
    newVisualCol,
    newPreferredCol,
  };
};

/**
 * Move cursor down one visual line
 * - If not on last line: move down one visual line
 * - Maintains or sets preferred column for consistent vertical navigation
 * - Clamps to line length if preferred column exceeds line
 */
export const moveDown: MovementFunction = (context) => {
  const { visualLines, visualCursor, preferredCol } = context;
  let [newVisualRow, newVisualCol] = visualCursor;
  let newPreferredCol = preferredCol;

  if (newVisualRow < visualLines.length - 1) {
    if (newPreferredCol === null) {
      newPreferredCol = newVisualCol;
    }
    newVisualRow++;
    newVisualCol = clamp(
      newPreferredCol,
      0,
      cpLen(visualLines[newVisualRow] ?? ''),
    );
  }

  return {
    newVisualRow,
    newVisualCol,
    newPreferredCol,
  };
};

/**
 * Move cursor to start of current visual line
 * - Sets visual column to 0
 * - Resets preferred column
 */
export const moveHome: MovementFunction = (context) => {
  const { visualCursor } = context;
  const [newVisualRow] = visualCursor;

  return {
    newVisualRow,
    newVisualCol: 0,
    newPreferredCol: null,
  };
};

/**
 * Move cursor to end of current visual line
 * - Sets visual column to line length
 * - Resets preferred column
 */
export const moveEnd: MovementFunction = (context) => {
  const { visualLines, visualCursor } = context;
  const [newVisualRow] = visualCursor;

  const currentVisLineLen = cpLen(visualLines[newVisualRow] ?? '');

  return {
    newVisualRow,
    newVisualCol: currentVisLineLen,
    newPreferredCol: null,
  };
};

/**
 * Move cursor to start of previous word
 * - Converts visual position to logical position
 * - Uses regex to find word boundaries
 * - Maps result back to visual coordinates
 * - Resets preferred column
 */
export const moveWordLeft: MovementFunction = (context) => {
  const { visualCursor, lines, visualToLogicalMap, logicalToVisualMap } =
    context;

  let [newVisualRow, newVisualCol] = visualCursor;

  // Early exit if mapping is unavailable
  if (visualToLogicalMap.length === 0 || logicalToVisualMap.length === 0) {
    return {
      newVisualRow,
      newVisualCol,
      newPreferredCol: null,
    };
  }

  const [logRow, logColInitial] = visualToLogicalMap[newVisualRow] ?? [0, 0];
  const currentLogCol = logColInitial + newVisualCol;
  const lineText = lines[logRow];

  // Find previous word boundary
  const sliceToCursor = cpSlice(lineText, 0, currentLogCol).replace(
    /[\s,.;!?]+$/,
    '',
  );

  let lastIdx = 0;
  const regex = /[\s,.;!?]+/g;
  let m;
  while ((m = regex.exec(sliceToCursor)) != null) {
    lastIdx = m.index;
  }

  const newLogicalCol =
    lastIdx === 0 ? 0 : cpLen(sliceToCursor.slice(0, lastIdx)) + 1;

  // Map back to visual coordinates
  const targetLogicalMapEntries = logicalToVisualMap[logRow];
  if (targetLogicalMapEntries) {
    for (let i = targetLogicalMapEntries.length - 1; i >= 0; i--) {
      const [visRow, logStartCol] = targetLogicalMapEntries[i];
      if (newLogicalCol >= logStartCol) {
        newVisualRow = visRow;
        newVisualCol = newLogicalCol - logStartCol;
        break;
      }
    }
  }

  return {
    newVisualRow,
    newVisualCol,
    newPreferredCol: null,
  };
};

/**
 * Move cursor to start of next word
 * - Converts visual position to logical position
 * - Uses regex to find next word boundary
 * - Handles end-of-line cases
 * - Maps result back to visual coordinates
 * - Resets preferred column
 */
export const moveWordRight: MovementFunction = (context) => {
  const {
    visualCursor,
    lines,
    currentLineLen,
    visualToLogicalMap,
    logicalToVisualMap,
  } = context;

  let [newVisualRow, newVisualCol] = visualCursor;

  // Early exit if mapping is unavailable
  if (visualToLogicalMap.length === 0 || logicalToVisualMap.length === 0) {
    return {
      newVisualRow,
      newVisualCol,
      newPreferredCol: null,
    };
  }

  const [logRow, logColInitial] = visualToLogicalMap[newVisualRow] ?? [0, 0];
  const currentLogCol = logColInitial + newVisualCol;
  const lineText = lines[logRow];
  const regex = /[\s,.;!?]+/g;
  let moved = false;
  let newLogicalCol = currentLineLen(logRow); // Default to end of logical line

  // Find next word boundary
  let m;
  while ((m = regex.exec(lineText)) != null) {
    const cpIdx = cpLen(lineText.slice(0, m.index));
    if (cpIdx > currentLogCol) {
      newLogicalCol = cpIdx;
      moved = true;
      break;
    }
  }

  if (!moved && currentLogCol < currentLineLen(logRow)) {
    // If no word break found after cursor, move to end
    newLogicalCol = currentLineLen(logRow);
  }

  // Map back to visual coordinates
  const targetLogicalMapEntries = logicalToVisualMap[logRow];
  if (targetLogicalMapEntries) {
    for (let i = 0; i < targetLogicalMapEntries.length; i++) {
      const [visRow, logStartCol] = targetLogicalMapEntries[i];
      const nextLogStartCol =
        i + 1 < targetLogicalMapEntries.length
          ? targetLogicalMapEntries[i + 1][1]
          : Infinity;

      if (newLogicalCol >= logStartCol && newLogicalCol < nextLogStartCol) {
        newVisualRow = visRow;
        newVisualCol = newLogicalCol - logStartCol;
        break;
      }

      if (
        newLogicalCol === logStartCol &&
        i === targetLogicalMapEntries.length - 1 &&
        cpLen(context.visualLines[visRow] ?? '') === 0
      ) {
        // Special case: moving to an empty visual line at the end of a logical line
        newVisualRow = visRow;
        newVisualCol = 0;
        break;
      }
    }
  }

  return {
    newVisualRow,
    newVisualCol,
    newPreferredCol: null,
  };
};

/**
 * Movement function registry for dispatching
 */
export const movementFunctions = {
  left: moveLeft,
  right: moveRight,
  up: moveUp,
  down: moveDown,
  home: moveHome,
  end: moveEnd,
  wordLeft: moveWordLeft,
  wordRight: moveWordRight,
} as const;
