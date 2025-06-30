/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stringWidth from 'string-width';
import { toCodePoints, cpLen } from './textUtils.js';
import type { VisualLayout } from './text-buffer-utils.js';

/* -------------------------------------------------------------------------
 *  Type Definitions
 * ---------------------------------------------------------------------- */

export interface LogicalLine {
  content: string;
  index: number;
}

export interface WrapResult {
  chunks: string[];
  breakPoints: number[];
  chunkStartPositions: number[];
}

export interface VisualLineMapping {
  visualLines: string[];
  logicalToVisualMap: Array<Array<[number, number]>>;
  visualToLogicalMap: Array<[number, number]>;
}

export interface CursorMapping {
  visualCursor: [number, number];
}

/* -------------------------------------------------------------------------
 *  Performance Cache
 * ---------------------------------------------------------------------- */

interface CacheEntry {
  input: string;
  width: number;
  result: WrapResult;
  lastUsed: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 100; // Reduce cache size for better memory management

  private createKey(text: string, width: number): string {
    return `${width}:${text.length}:${text.slice(0, 50)}`;
  }

  get(text: string, width: number): WrapResult | null {
    const key = this.createKey(text, width);
    const entry = this.cache.get(key);
    if (entry && entry.input === text && entry.width === width) {
      entry.lastUsed = Date.now();
      return entry.result;
    }
    return null;
  }

  set(text: string, width: number, result: WrapResult): void {
    const key = this.createKey(text, width);

    // Evict old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      input: text,
      width,
      result: { ...result }, // Deep copy to prevent mutations
      lastUsed: Date.now(),
    });
  }

  private evictOldest(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getMaxSize(): number {
    return this.maxSize;
  }
}

const wrapCache = new LRUCache();

/* -------------------------------------------------------------------------
 *  Optimized Functions
 * ---------------------------------------------------------------------- */

/**
 * Optimized text wrapping function with intelligent word boundary detection.
 * Handles text wrapping for individual logical lines with performance optimizations.
 *
 * @param text - Text content to wrap
 * @param viewportWidth - Maximum width for wrapping
 * @returns WrapResult with chunks, break points, and start positions
 */
export function wrapLogicalLine(
  text: string,
  viewportWidth: number,
): WrapResult {
  // Handle edge cases
  if (viewportWidth <= 0) {
    return {
      chunks: [text],
      breakPoints: [text.length],
      chunkStartPositions: [0],
    };
  }

  if (text.length === 0) {
    return { chunks: [''], breakPoints: [0], chunkStartPositions: [0] };
  }

  // Only use cache for longer texts to avoid overhead on short texts
  if (text.length > 200) {
    const cached = wrapCache.get(text, viewportWidth);
    if (cached) {
      return cached;
    }
  }

  const codePoints = toCodePoints(text);

  // Pre-allocate arrays with estimated size to reduce memory allocations
  const estimatedChunks = Math.max(
    1,
    Math.ceil(codePoints.length / viewportWidth),
  );
  const chunks: string[] = new Array(estimatedChunks);
  const breakPoints: number[] = new Array(estimatedChunks);
  const chunkStartPositions: number[] = new Array(estimatedChunks);

  let chunkCount = 0;

  if (codePoints.length === 0) {
    const result = { chunks: [''], breakPoints: [0], chunkStartPositions: [0] };
    wrapCache.set(text, viewportWidth, result);
    return result;
  }

  let currentPos = 0;

  while (currentPos < codePoints.length) {
    let chunkEndPos = currentPos;
    let currentWidth = 0;
    let lastWordBreak = -1;
    let wordBreakWidth = 0;

    // Scan ahead to find the optimal break point
    while (chunkEndPos < codePoints.length) {
      const char = codePoints[chunkEndPos];
      const charWidth = stringWidth(char);

      // Check if adding this character would exceed viewport width
      if (currentWidth + charWidth > viewportWidth) {
        // If we have a valid word break and it's not at the start, use it
        if (lastWordBreak !== -1 && lastWordBreak > currentPos) {
          chunkEndPos = lastWordBreak;
          currentWidth = wordBreakWidth;
          break;
        }

        // No word break available, force break at current position
        // But ensure we always advance at least one character
        if (chunkEndPos === currentPos) {
          chunkEndPos = currentPos + 1;
        }
        break;
      }

      // Track word boundaries (spaces)
      if (char === ' ') {
        lastWordBreak = chunkEndPos;
        wordBreakWidth = currentWidth;
      }

      currentWidth += charWidth;
      chunkEndPos++;
    }

    // Extract the chunk
    const chunk = codePoints.slice(currentPos, chunkEndPos).join('');
    chunks[chunkCount] = chunk;
    chunkStartPositions[chunkCount] = currentPos;
    breakPoints[chunkCount] = chunkEndPos;
    chunkCount++;

    currentPos = chunkEndPos;

    // Skip the space that acted as a word break delimiter (like the original implementation)
    if (currentPos < codePoints.length && codePoints[currentPos] === ' ') {
      currentPos++;
    }
  }

  // Trim arrays to actual size used
  chunks.length = chunkCount;
  breakPoints.length = chunkCount;
  chunkStartPositions.length = chunkCount;

  const result = { chunks, breakPoints, chunkStartPositions };

  // Only cache longer texts to avoid overhead
  if (text.length > 200) {
    wrapCache.set(text, viewportWidth, result);
  }

  return result;
}

/**
 * Binary search cursor mapping from logical to visual coordinates.
 * Converts logical cursor position to visual coordinates with O(log n) complexity.
 *
 * @param logicalCursor - Logical cursor position [row, col]
 * @param logicalToVisualMap - Mapping from logical to visual lines
 * @param visualLines - Array of visual line strings
 * @returns Visual cursor position [row, col]
 */
export function mapCursorToVisual(
  logicalCursor: [number, number],
  logicalToVisualMap: Array<Array<[number, number]>>,
  visualLines: string[],
): [number, number] {
  const [logRow, logCol] = logicalCursor;

  // Handle edge cases - match original implementation behavior
  if (logRow >= logicalToVisualMap.length || logRow < 0) {
    // Invalid logical row, place at origin like original implementation
    return [0, 0];
  }

  const visualMappings = logicalToVisualMap[logRow];
  if (!visualMappings || visualMappings.length === 0) {
    return [0, 0];
  }

  // For small arrays, linear search is faster than binary search
  if (visualMappings.length <= 4) {
    for (let i = 0; i < visualMappings.length; i++) {
      const [visualLineIdx, startCol] = visualMappings[i];

      // Get the end column for this segment
      let endCol: number;
      if (i < visualMappings.length - 1) {
        endCol = visualMappings[i + 1][1];
      } else {
        // Last segment, extends to end of logical line
        endCol = Number.MAX_SAFE_INTEGER;
      }

      if (logCol >= startCol && logCol < endCol) {
        // Found the exact segment
        const visualCol = logCol - startCol;
        const actualVisualLineLength = cpLen(visualLines[visualLineIdx] || '');
        return [visualLineIdx, Math.min(visualCol, actualVisualLineLength)];
      }
    }

    // Use last segment if not found
    const lastMapping = visualMappings[visualMappings.length - 1];
    const [visualLineIdx, startCol] = lastMapping;
    const visualCol = Math.max(0, logCol - startCol);
    const actualVisualLineLength = cpLen(visualLines[visualLineIdx] || '');
    return [visualLineIdx, Math.min(visualCol, actualVisualLineLength)];
  }

  // Binary search for larger arrays
  let left = 0;
  let right = visualMappings.length - 1;
  let bestMatch = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const [visualLineIdx, startCol] = visualMappings[mid];

    // Get the end column for this segment
    let endCol: number;
    if (mid < visualMappings.length - 1) {
      endCol = visualMappings[mid + 1][1];
    } else {
      // Last segment, extends to end of logical line
      endCol = Number.MAX_SAFE_INTEGER;
    }

    if (logCol >= startCol && logCol < endCol) {
      // Found the exact segment
      const visualCol = logCol - startCol;
      const actualVisualLineLength = cpLen(visualLines[visualLineIdx] || '');
      return [visualLineIdx, Math.min(visualCol, actualVisualLineLength)];
    } else if (logCol < startCol) {
      right = mid - 1;
    } else {
      bestMatch = mid;
      left = mid + 1;
    }
  }

  // Use the best match found
  const [visualLineIdx, startCol] = visualMappings[bestMatch];
  const visualCol = Math.max(0, logCol - startCol);
  const actualVisualLineLength = cpLen(visualLines[visualLineIdx] || '');
  return [visualLineIdx, Math.min(visualCol, actualVisualLineLength)];
}

/**
 * Efficiently constructs complete visual line array from logical lines.
 * Builds visual lines with proper mapping structures using optimized algorithms.
 *
 * @param logicalLines - Array of logical text lines
 * @param viewportWidth - Width for wrapping calculations
 * @returns VisualLineMapping with visual lines and mapping structures
 */
export function buildVisualLines(
  logicalLines: string[],
  viewportWidth: number,
): VisualLineMapping {
  const visualLines: string[] = [];
  const logicalToVisualMap: Array<Array<[number, number]>> = [];
  const visualToLogicalMap: Array<[number, number]> = [];

  // Handle empty input
  if (logicalLines.length === 0) {
    visualLines.push('');
    logicalToVisualMap.push([[0, 0]]);
    visualToLogicalMap.push([0, 0]);
    return { visualLines, logicalToVisualMap, visualToLogicalMap };
  }

  logicalLines.forEach((logicalLine, logIndex) => {
    logicalToVisualMap[logIndex] = [];

    if (logicalLine.length === 0) {
      // Handle empty logical line
      const visualLineIndex = visualLines.length;
      logicalToVisualMap[logIndex].push([visualLineIndex, 0]);
      visualToLogicalMap.push([logIndex, 0]);
      visualLines.push('');
    } else {
      // Non-empty logical line - wrap it
      const wrapResult = wrapLogicalLine(logicalLine, viewportWidth);

      wrapResult.chunks.forEach((chunk, chunkIndex) => {
        const visualLineIndex = visualLines.length;
        const startPosInLogical = wrapResult.chunkStartPositions[chunkIndex];

        logicalToVisualMap[logIndex].push([visualLineIndex, startPosInLogical]);
        visualToLogicalMap.push([logIndex, startPosInLogical]);
        visualLines.push(chunk);
      });
    }
  });

  // Ensure at least one visual line exists
  if (visualLines.length === 0) {
    visualLines.push('');
    if (logicalToVisualMap.length === 0) {
      logicalToVisualMap.push([[0, 0]]);
    } else if (logicalToVisualMap[0].length === 0) {
      logicalToVisualMap[0].push([0, 0]);
    }
    if (visualToLogicalMap.length === 0) {
      visualToLogicalMap.push([0, 0]);
    }
  }

  return { visualLines, logicalToVisualMap, visualToLogicalMap };
}

/**
 * Main orchestrator function for optimized visual layout calculation.
 * Coordinates the 4-function decomposition with memoization and performance optimizations.
 *
 * @param logicalLines - Array of logical text lines
 * @param logicalCursor - Current logical cursor position [row, col]
 * @param viewportWidth - Width of viewport for wrapping calculations
 * @returns Complete VisualLayout information
 */
export function calculateVisualLayoutOptimized(
  logicalLines: string[],
  logicalCursor: [number, number],
  viewportWidth: number,
): VisualLayout {
  // Normalize viewport width to prevent issues
  const normalizedWidth = Math.max(1, viewportWidth);

  // Step 1: Build visual lines and mappings
  const visualMapping = buildVisualLines(logicalLines, normalizedWidth);

  // Step 2: Map cursor to visual coordinates
  const visualCursor = mapCursorToVisual(
    logicalCursor,
    visualMapping.logicalToVisualMap,
    visualMapping.visualLines,
  );

  return {
    visualLines: visualMapping.visualLines,
    visualCursor,
    logicalToVisualMap: visualMapping.logicalToVisualMap,
    visualToLogicalMap: visualMapping.visualToLogicalMap,
  };
}

/* -------------------------------------------------------------------------
 *  Cache Management Utilities
 * ---------------------------------------------------------------------- */

/**
 * Clears the internal caches for testing or memory management.
 * Should be used sparingly in production.
 */
export function clearOptimizationCaches(): void {
  wrapCache.clear();
}

/**
 * Gets cache statistics for monitoring and debugging.
 * @returns Object with cache size and hit rate information
 */
export function getCacheStats(): {
  wrapCacheSize: number;
  maxCacheSize: number;
} {
  return {
    wrapCacheSize: wrapCache.getCacheSize(),
    maxCacheSize: wrapCache.getMaxSize(),
  };
}
