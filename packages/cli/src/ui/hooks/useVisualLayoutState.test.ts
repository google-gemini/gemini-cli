/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVisualLayoutState } from './useVisualLayoutState.js';

describe('useVisualLayoutState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello world'],
          logicalCursor: [0, 5],
          viewportWidth: 80,
        }),
      );

      expect(result.current.visualLines).toEqual(['Hello world']);
      expect(result.current.visualCursor).toEqual([0, 5]);
      expect(result.current.visualScrollRow).toBe(0);
      expect(result.current.logicalToVisualMap).toEqual([[[0, 0]]]);
      expect(result.current.visualToLogicalMap).toEqual([[0, 0]]);
    });

    it('should initialize with custom viewport settings', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Short'],
          logicalCursor: [0, 2],
          viewportWidth: 10,
          viewportHeight: 5,
          initialVisualScrollRow: 2,
        }),
      );

      expect(result.current.visualLines).toEqual(['Short']);
      expect(result.current.visualCursor).toEqual([0, 2]);
      expect(result.current.visualScrollRow).toBe(2);
    });

    it('should handle empty logical lines', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: [],
          logicalCursor: [0, 0],
          viewportWidth: 80,
        }),
      );

      expect(result.current.visualLines).toEqual(['']);
      expect(result.current.visualCursor).toEqual([0, 0]);
      expect(result.current.logicalToVisualMap).toEqual([[[0, 0]]]);
      expect(result.current.visualToLogicalMap).toEqual([[0, 0]]);
    });
  });

  describe('line wrapping', () => {
    it('should wrap long lines correctly', () => {
      const longLine =
        'This is a very long line that should wrap at the viewport width boundary for testing purposes';
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: [longLine],
          logicalCursor: [0, 0],
          viewportWidth: 20,
        }),
      );

      // Should wrap into multiple visual lines
      expect(result.current.visualLines.length).toBeGreaterThan(1);
      expect(result.current.visualLines[0]).toBe('This is a very long');
      expect(result.current.logicalToVisualMap[0].length).toBeGreaterThan(1);
    });

    it('should handle word boundaries in wrapping', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello world test'],
          logicalCursor: [0, 0],
          viewportWidth: 10,
        }),
      );

      // Should break at word boundaries
      expect(result.current.visualLines).toEqual(['Hello', 'world test']);
      expect(result.current.logicalToVisualMap[0]).toEqual([
        [0, 0], // First visual line starts at logical position 0
        [1, 6], // Second visual line starts at logical position 6
      ]);
    });

    it('should handle single characters wider than viewport', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['🌍'],
          logicalCursor: [0, 0],
          viewportWidth: 0,
        }),
      );

      // Should still include the character even if wider than viewport
      expect(result.current.visualLines).toEqual(['🌍']);
      expect(result.current.visualCursor).toEqual([0, 0]);
    });
  });

  describe('cursor mapping', () => {
    it('should map logical cursor to visual cursor correctly', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello world test line'],
          logicalCursor: [0, 12], // Position at 't' in 'test'
          viewportWidth: 10,
        }),
      );

      // Should map to the correct visual line and column
      const visualCursor = result.current.visualCursor;
      expect(visualCursor[0]).toBeGreaterThan(0); // Should be on a wrapped line
      expect(visualCursor[1]).toBe(0); // Should be at start of visual line
    });

    it('should handle cursor at end of wrapped line', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello world'],
          logicalCursor: [0, 11], // End of line
          viewportWidth: 8,
        }),
      );

      const visualCursor = result.current.visualCursor;
      expect(visualCursor).toBeDefined();
      expect(visualCursor[0]).toBeGreaterThanOrEqual(0);
      expect(visualCursor[1]).toBeGreaterThanOrEqual(0);
    });

    it('should update cursor when logical cursor changes', () => {
      const { result, rerender } = renderHook(
        ({ logicalCursor }) =>
          useVisualLayoutState({
            logicalLines: ['Hello world test'],
            logicalCursor,
            viewportWidth: 10,
          }),
        { initialProps: { logicalCursor: [0, 0] as [number, number] } },
      );

      const initialVisualCursor = result.current.visualCursor;

      // Move cursor to different position
      rerender({ logicalCursor: [0, 8] });

      const newVisualCursor = result.current.visualCursor;
      expect(newVisualCursor).not.toEqual(initialVisualCursor);
    });
  });

  describe('visual scrolling', () => {
    it('should update visual scroll position', () => {
      const onVisualScrollChange = vi.fn();
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'],
          logicalCursor: [0, 0],
          viewportWidth: 80,
          viewportHeight: 3,
          onVisualScrollChange,
        }),
      );

      act(() => {
        result.current.setVisualScrollRow(2);
      });

      expect(result.current.visualScrollRow).toBe(2);
      expect(onVisualScrollChange).toHaveBeenCalledWith(2);
    });

    it('should auto-scroll to keep cursor visible', () => {
      const onVisualScrollChange = vi.fn();
      const { result, rerender } = renderHook(
        ({ logicalCursor }) =>
          useVisualLayoutState({
            logicalLines: Array(20).fill('Line content'),
            logicalCursor,
            viewportWidth: 80,
            viewportHeight: 5,
            onVisualScrollChange,
          }),
        { initialProps: { logicalCursor: [0, 0] as [number, number] } },
      );

      // Move cursor to far down position to trigger auto-scroll
      rerender({ logicalCursor: [15, 0] });

      // Should automatically scroll to show cursor
      expect(result.current.visualScrollRow).toBeGreaterThan(0);
    });

    it('should clamp scroll position to valid bounds', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Line 1', 'Line 2'],
          logicalCursor: [0, 0],
          viewportWidth: 80,
          viewportHeight: 5,
        }),
      );

      act(() => {
        result.current.setVisualScrollRow(-5);
      });

      expect(result.current.visualScrollRow).toBe(0);

      act(() => {
        result.current.setVisualScrollRow(100);
      });

      // Should clamp to reasonable bound based on content
      expect(result.current.visualScrollRow).toBeLessThanOrEqual(2);
    });
  });

  describe('layout recalculation', () => {
    it('should recalculate layout when logical lines change', () => {
      const { result, rerender } = renderHook(
        ({ logicalLines }) =>
          useVisualLayoutState({
            logicalLines,
            logicalCursor: [0, 0],
            viewportWidth: 10,
          }),
        { initialProps: { logicalLines: ['Short'] } },
      );

      const initialVisualLines = result.current.visualLines;

      // Change to longer line that should wrap
      rerender({ logicalLines: ['This is a much longer line that will wrap'] });

      const newVisualLines = result.current.visualLines;
      expect(newVisualLines).not.toEqual(initialVisualLines);
      expect(newVisualLines.length).toBeGreaterThan(1);
    });

    it('should recalculate layout when viewport width changes', () => {
      const { result, rerender } = renderHook(
        ({ viewportWidth }) =>
          useVisualLayoutState({
            logicalLines: ['This is a line that may wrap'],
            logicalCursor: [0, 0],
            viewportWidth,
          }),
        { initialProps: { viewportWidth: 30 } },
      );

      const initialVisualLines = result.current.visualLines;

      // Make viewport narrower to force wrapping
      rerender({ viewportWidth: 10 });

      const newVisualLines = result.current.visualLines;
      expect(newVisualLines.length).toBeGreaterThan(initialVisualLines.length);
    });

    it('should notify callback when layout changes', () => {
      const onLayoutChange = vi.fn();
      const { rerender } = renderHook(
        ({ logicalLines }) =>
          useVisualLayoutState({
            logicalLines,
            logicalCursor: [0, 0],
            viewportWidth: 10,
            onLayoutChange,
          }),
        { initialProps: { logicalLines: ['Short'] } },
      );

      onLayoutChange.mockClear();

      // Change lines to trigger layout recalculation
      rerender({ logicalLines: ['This is a much longer line'] });

      expect(onLayoutChange).toHaveBeenCalled();
    });
  });

  describe('viewport utilities', () => {
    it('should calculate visible visual lines', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: Array(10).fill('Line content'),
          logicalCursor: [0, 0],
          viewportWidth: 80,
          viewportHeight: 5,
          initialVisualScrollRow: 2,
        }),
      );

      const visibleLines = result.current.getVisibleVisualLines();
      expect(visibleLines).toHaveLength(5); // viewport height
      expect(visibleLines[0]).toBe('Line content'); // Should start from scroll position
    });

    it('should check if visual line is visible', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: Array(10).fill('Line content'),
          logicalCursor: [0, 0],
          viewportWidth: 80,
          viewportHeight: 3,
          initialVisualScrollRow: 2,
        }),
      );

      expect(result.current.isVisualLineVisible(1)).toBe(false); // Above viewport
      expect(result.current.isVisualLineVisible(2)).toBe(true); // In viewport
      expect(result.current.isVisualLineVisible(4)).toBe(true); // In viewport
      expect(result.current.isVisualLineVisible(5)).toBe(false); // Below viewport
    });

    it('should get visual cursor position relative to viewport', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: Array(10).fill('Line content'),
          logicalCursor: [3, 5],
          viewportWidth: 80,
          viewportHeight: 5,
          initialVisualScrollRow: 1,
        }),
      );

      const relativeCursor = result.current.getVisualCursorRelativeToViewport();
      expect(relativeCursor).toBeDefined();
      expect(relativeCursor[0]).toBeGreaterThanOrEqual(0);
      expect(relativeCursor[0]).toBeLessThan(5); // Within viewport height
    });
  });

  describe('mapping utilities', () => {
    it('should convert visual position to logical position', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello world test'],
          logicalCursor: [0, 0],
          viewportWidth: 10,
        }),
      );

      const logicalPos = result.current.visualToLogical(1, 2); // Second visual line, position 2
      expect(logicalPos).toBeDefined();
      expect(logicalPos[0]).toBe(0); // Same logical line
      expect(logicalPos[1]).toBeGreaterThan(2); // But different logical column
    });

    it('should convert logical position to visual position', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello world test'],
          logicalCursor: [0, 0],
          viewportWidth: 10,
        }),
      );

      const visualPos = result.current.logicalToVisual(0, 8); // Middle of logical line
      expect(visualPos).toBeDefined();
      expect(visualPos[0]).toBeGreaterThanOrEqual(0);
      expect(visualPos[1]).toBeGreaterThanOrEqual(0);
    });

    it('should handle invalid positions gracefully', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Short'],
          logicalCursor: [0, 0],
          viewportWidth: 10,
        }),
      );

      // Test out-of-bounds positions
      expect(result.current.visualToLogical(-1, 0)).toBeNull();
      expect(result.current.visualToLogical(100, 0)).toBeNull();
      expect(result.current.logicalToVisual(-1, 0)).toBeNull();
      expect(result.current.logicalToVisual(100, 0)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle zero viewport width', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Hello'],
          logicalCursor: [0, 0],
          viewportWidth: 0,
        }),
      );

      // Should still work, possibly showing one character per line
      expect(result.current.visualLines).toBeDefined();
      expect(result.current.visualLines.length).toBeGreaterThan(0);
    });

    it('should handle empty lines in logical text', () => {
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: ['Line 1', '', 'Line 3'],
          logicalCursor: [1, 0],
          viewportWidth: 10,
        }),
      );

      expect(result.current.visualLines).toContain('');
      expect(result.current.visualCursor[0]).toBe(1); // Should be on empty line
    });

    it('should handle very long words that cannot wrap', () => {
      const longWord = 'supercalifragilisticexpialidocious';
      const { result } = renderHook(() =>
        useVisualLayoutState({
          logicalLines: [longWord],
          logicalCursor: [0, 10],
          viewportWidth: 8,
        }),
      );

      // Should handle gracefully, possibly hard-wrapping
      expect(result.current.visualLines).toBeDefined();
      expect(result.current.visualLines.length).toBeGreaterThan(0);
    });
  });

  describe('performance and memoization', () => {
    it('should maintain stable output when inputs unchanged', () => {
      const { result, rerender } = renderHook(
        ({ trigger }) => {
          void trigger;
          return useVisualLayoutState({
            logicalLines: ['Same line'],
            logicalCursor: [0, 0],
            viewportWidth: 10,
          });
        },
        { initialProps: { trigger: 1 } },
      );

      const initialOutput = {
        visualLines: result.current.visualLines,
        visualCursor: result.current.visualCursor,
        visualScrollRow: result.current.visualScrollRow,
      };

      // Rerender without changing layout-affecting props
      rerender({ trigger: 2 });

      // Output should remain consistent
      expect(result.current.visualLines).toEqual(initialOutput.visualLines);
      expect(result.current.visualCursor).toEqual(initialOutput.visualCursor);
      expect(result.current.visualScrollRow).toBe(
        initialOutput.visualScrollRow,
      );
    });
  });
});
