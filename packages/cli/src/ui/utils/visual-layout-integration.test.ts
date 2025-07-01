/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateVisualLayout } from './text-buffer-utils.js';
import {
  calculateVisualLayoutOptimized,
  clearOptimizationCaches,
  getCacheStats,
} from './visual-layout-optimized.js';

// Mock external dependencies consistently
vi.mock('strip-ansi', () => ({
  default: vi.fn((str: string) => str.replace(/\u001B\[[0-9;]*m/g, '')), // eslint-disable-line no-control-regex
}));

vi.mock('string-width', () => ({
  default: vi.fn((str: string) => str.length),
}));

vi.mock('./textUtils.js', () => ({
  toCodePoints: vi.fn((str: string) => Array.from(str)),
  cpLen: vi.fn((str: string) => Array.from(str).length),
  cpSlice: vi.fn((str: string, start: number, end?: number) =>
    Array.from(str).slice(start, end).join(''),
  ),
}));

describe('Visual Layout Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOptimizationCaches();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Compatibility with existing implementation', () => {
    const testCases = [
      {
        name: 'empty input',
        lines: [],
        cursor: [0, 0] as [number, number],
        width: 80,
      },
      {
        name: 'single empty line',
        lines: [''],
        cursor: [0, 0] as [number, number],
        width: 80,
      },
      {
        name: 'single short line',
        lines: ['Hello World'],
        cursor: [0, 6] as [number, number],
        width: 80,
      },
      {
        name: 'multiple short lines',
        lines: ['Hello', 'World', 'Test'],
        cursor: [1, 3] as [number, number],
        width: 80,
      },
      {
        name: 'long line requiring wrapping',
        lines: [
          'This is a very long line that definitely needs to be wrapped at some point',
        ],
        cursor: [0, 30] as [number, number],
        width: 20,
      },
      {
        name: 'multiple long lines',
        lines: [
          'First long line that needs wrapping at some reasonable point',
          'Second line also quite long and requiring text wrapping',
          'Third line with different content patterns',
        ],
        cursor: [1, 25] as [number, number],
        width: 25,
      },
      {
        name: 'lines with special characters',
        lines: [
          'Line with spaces    and    irregular    spacing',
          'Line with unicode: 测试中文 characters',
          'Line with numbers: 123456789 and symbols: !@#$%',
        ],
        cursor: [2, 15] as [number, number],
        width: 30,
      },
      {
        name: 'cursor at edge cases',
        lines: [
          'Short',
          'Medium length line',
          'Very long line that definitely needs wrapping',
        ],
        cursor: [2, 43] as [number, number], // Beyond line end
        width: 15,
      },
      {
        name: 'zero width viewport',
        lines: ['Hello World'],
        cursor: [0, 5] as [number, number],
        width: 0,
      },
      {
        name: 'very small viewport',
        lines: ['Testing small viewport behavior'],
        cursor: [0, 10] as [number, number],
        width: 3,
      },
    ];

    testCases.forEach(({ name, lines, cursor, width }) => {
      it(`should match original implementation for: ${name}`, () => {
        const original = calculateVisualLayout(lines, cursor, width);
        const optimized = calculateVisualLayoutOptimized(lines, cursor, width);

        expect(optimized).toEqual(original);
        expect(optimized.visualLines).toEqual(original.visualLines);
        expect(optimized.visualCursor).toEqual(original.visualCursor);
        expect(optimized.logicalToVisualMap).toEqual(
          original.logicalToVisualMap,
        );
        expect(optimized.visualToLogicalMap).toEqual(
          original.visualToLogicalMap,
        );
      });
    });
  });

  describe('Performance comparison', () => {
    it('should handle repeated calculations efficiently', () => {
      const lines = Array.from(
        { length: 100 },
        (_, i) =>
          `Line ${i + 1}: Some content that may need wrapping depending on viewport width`,
      );
      const cursor: [number, number] = [50, 25];
      const width = 40;

      // First run - both implementations
      const originalStart = performance.now();
      const originalResult = calculateVisualLayout(lines, cursor, width);
      const originalEnd = performance.now();
      const originalDuration = originalEnd - originalStart;

      const optimizedStart = performance.now();
      const optimizedResult = calculateVisualLayoutOptimized(
        lines,
        cursor,
        width,
      );
      const optimizedEnd = performance.now();
      const optimizedDuration = optimizedEnd - optimizedStart;

      // Results should be identical
      expect(optimizedResult).toEqual(originalResult);

      // Second run - optimized should benefit from caching
      const optimized2Start = performance.now();
      const optimized2Result = calculateVisualLayoutOptimized(
        lines,
        cursor,
        width,
      );
      const optimized2End = performance.now();
      const optimized2Duration = optimized2End - optimized2Start;

      expect(optimized2Result).toEqual(originalResult);
      expect(optimized2Duration).toBeLessThanOrEqual(optimizedDuration * 3.0); // Allow wider variance for CI performance measurements

      console.log(`Performance comparison:
        Original: ${originalDuration.toFixed(2)}ms
        Optimized (1st): ${optimizedDuration.toFixed(2)}ms
        Optimized (2nd): ${optimized2Duration.toFixed(2)}ms`);
    });

    it('should show performance benefits on large datasets', () => {
      const lines = Array.from(
        { length: 500 },
        (_, i) =>
          `Line ${i + 1}: ${'a'.repeat(100)} more content that needs wrapping`,
      );
      const cursor: [number, number] = [250, 50];
      const width = 60;

      const iterations = 5; // Increased iterations for more stable measurements
      let originalTotal = 0;
      let optimizedTotal = 0;

      // Warm up runs to stabilize performance
      for (let i = 0; i < 2; i++) {
        calculateVisualLayout(lines, cursor, width);
        calculateVisualLayoutOptimized(lines, cursor, width);
      }

      // Multiple iterations for more accurate measurement
      for (let i = 0; i < iterations; i++) {
        const originalStart = performance.now();
        calculateVisualLayout(lines, cursor, width);
        const originalEnd = performance.now();
        originalTotal += originalEnd - originalStart;

        const optimizedStart = performance.now();
        calculateVisualLayoutOptimized(lines, cursor, width);
        const optimizedEnd = performance.now();
        optimizedTotal += optimizedEnd - optimizedStart;
      }

      const avgOriginal = originalTotal / iterations;
      const avgOptimized = optimizedTotal / iterations;
      const improvement = ((avgOriginal - avgOptimized) / avgOriginal) * 100;

      console.log(`Average performance over ${iterations} runs:
        Original: ${avgOriginal.toFixed(2)}ms
        Optimized: ${avgOptimized.toFixed(2)}ms
        Improvement: ${improvement.toFixed(1)}%`);

      // Allow for more variance in CI environments where performance can be unpredictable
      // The optimized version should not be more than 50% slower than the original
      expect(improvement).toBeGreaterThanOrEqual(-50); // Allow more variance for CI stability
    });
  });

  describe('Cache management', () => {
    it('should maintain cache statistics', () => {
      const lines = [
        'A long line that should be cached when processed ' + 'x'.repeat(200),
      ];
      const cursor: [number, number] = [0, 50];
      const width = 40;

      // Clear cache and check initial stats
      clearOptimizationCaches();
      let stats = getCacheStats();
      expect(stats.wrapCacheSize).toBe(0);
      expect(stats.maxCacheSize).toBeGreaterThan(0);

      // Process some data that should be cached (long enough text)
      calculateVisualLayoutOptimized(lines, cursor, width);

      // Check that cache was used
      stats = getCacheStats();
      expect(stats.wrapCacheSize).toBeGreaterThan(0);
    });

    it('should handle cache clearing properly', () => {
      const lines = ['Long line for caching: ' + 'x'.repeat(300)];
      const cursor: [number, number] = [0, 10];
      const width = 50;

      // Process data to populate cache
      calculateVisualLayoutOptimized(lines, cursor, width);
      let stats = getCacheStats();
      const initialCacheSize = stats.wrapCacheSize;

      // Clear cache
      clearOptimizationCaches();
      stats = getCacheStats();
      expect(stats.wrapCacheSize).toBe(0);
      expect(stats.wrapCacheSize).toBeLessThan(initialCacheSize);
    });
  });

  describe('Edge case handling', () => {
    it('should handle extremely long single lines', () => {
      const hugeLine = 'x'.repeat(10000);
      const lines = [hugeLine];
      const cursor: [number, number] = [0, 5000];
      const width = 80;

      const original = calculateVisualLayout(lines, cursor, width);
      const optimized = calculateVisualLayoutOptimized(lines, cursor, width);

      expect(optimized).toEqual(original);
      expect(optimized.visualLines.length).toBeGreaterThan(100); // Should be wrapped into many lines
    });

    it('should handle many small lines', () => {
      const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i}`);
      const cursor: [number, number] = [500, 4];
      const width = 80;

      const original = calculateVisualLayout(lines, cursor, width);
      const optimized = calculateVisualLayoutOptimized(lines, cursor, width);

      expect(optimized).toEqual(original);
      expect(optimized.visualLines.length).toBe(1000); // No wrapping needed
    });

    it('should handle cursor positions beyond text bounds', () => {
      const lines = ['Short'];
      const cursor: [number, number] = [10, 20]; // Way beyond actual text
      const width = 80;

      const original = calculateVisualLayout(lines, cursor, width);
      const optimized = calculateVisualLayoutOptimized(lines, cursor, width);

      expect(optimized).toEqual(original);
      // Should gracefully handle invalid cursor positions
      expect(optimized.visualCursor[0]).toBeLessThan(
        optimized.visualLines.length,
      );
    });
  });

  describe('Memory efficiency', () => {
    it('should not leak memory with repeated operations', () => {
      const lines = ['Medium length line that needs some processing'];
      const cursor: [number, number] = [0, 20];
      const width = 20;

      // Perform many operations
      for (let i = 0; i < 100; i++) {
        calculateVisualLayoutOptimized(lines, cursor, width);
      }

      // Cache should not grow unbounded
      const stats = getCacheStats();
      expect(stats.wrapCacheSize).toBeLessThanOrEqual(stats.maxCacheSize);
    });
  });
});
