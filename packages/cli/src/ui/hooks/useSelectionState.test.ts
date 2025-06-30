/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSelectionState } from './useSelectionState.js';

describe('useSelectionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty selection state', () => {
      const { result } = renderHook(() => useSelectionState());

      expect(result.current.selectionAnchor).toBeNull();
      expect(result.current.selectionExtent).toBeNull();
      expect(result.current.hasSelection).toBe(false);
      expect(result.current.clipboardContent).toBe('');
    });

    it('should initialize with provided selection', () => {
      const initialAnchor = [0, 5];
      const initialExtent = [0, 10];
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: initialAnchor,
          initialSelectionExtent: initialExtent,
        }),
      );

      expect(result.current.selectionAnchor).toEqual([0, 5]);
      expect(result.current.selectionExtent).toEqual([0, 10]);
      expect(result.current.hasSelection).toBe(true);
    });

    it('should handle invalid initial selection', () => {
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 5],
          // No extent provided - should clear anchor too
        }),
      );

      expect(result.current.selectionAnchor).toBeNull();
      expect(result.current.selectionExtent).toBeNull();
      expect(result.current.hasSelection).toBe(false);
    });
  });

  describe('selection management', () => {
    it('should set selection anchor and extent', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange }),
      );

      act(() => {
        result.current.setSelection([0, 5], [0, 10]);
      });

      expect(result.current.selectionAnchor).toEqual([0, 5]);
      expect(result.current.selectionExtent).toEqual([0, 10]);
      expect(result.current.hasSelection).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledWith([0, 5], [0, 10]);
    });

    it('should clear selection', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 5],
          initialSelectionExtent: [0, 10],
          onSelectionChange,
        }),
      );

      expect(result.current.hasSelection).toBe(true);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectionAnchor).toBeNull();
      expect(result.current.selectionExtent).toBeNull();
      expect(result.current.hasSelection).toBe(false);
      expect(onSelectionChange).toHaveBeenCalledWith(null, null);
    });

    it('should set selection anchor only', () => {
      const { result } = renderHook(() => useSelectionState());

      act(() => {
        result.current.setSelectionAnchor([1, 3]);
      });

      expect(result.current.selectionAnchor).toEqual([1, 3]);
      expect(result.current.selectionExtent).toBeNull();
      expect(result.current.hasSelection).toBe(false); // Need both anchor and extent
    });

    it('should set selection extent only', () => {
      const { result } = renderHook(() => useSelectionState());

      act(() => {
        result.current.setSelectionExtent([1, 8]);
      });

      expect(result.current.selectionAnchor).toBeNull();
      expect(result.current.selectionExtent).toEqual([1, 8]);
      expect(result.current.hasSelection).toBe(false); // Need both anchor and extent
    });

    it('should complete selection when both anchor and extent are set', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange }),
      );

      act(() => {
        result.current.setSelectionAnchor([0, 5]);
      });

      expect(result.current.hasSelection).toBe(false);
      expect(onSelectionChange).not.toHaveBeenCalled();

      act(() => {
        result.current.setSelectionExtent([0, 10]);
      });

      expect(result.current.hasSelection).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledWith([0, 5], [0, 10]);
    });
  });

  describe('selection utilities', () => {
    it('should get selection bounds (start and end)', () => {
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 10],
          initialSelectionExtent: [0, 5], // Reverse selection
        }),
      );

      const bounds = result.current.getSelectionBounds();
      expect(bounds).toEqual({
        start: [0, 5], // Earlier position
        end: [0, 10], // Later position
      });
    });

    it('should return null bounds when no selection', () => {
      const { result } = renderHook(() => useSelectionState());

      const bounds = result.current.getSelectionBounds();
      expect(bounds).toBeNull();
    });

    it('should check if position is within selection', () => {
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 5],
          initialSelectionExtent: [0, 10],
        }),
      );

      expect(result.current.isPositionInSelection([0, 3])).toBe(false); // Before
      expect(result.current.isPositionInSelection([0, 7])).toBe(true); // Within
      expect(result.current.isPositionInSelection([0, 12])).toBe(false); // After
      expect(result.current.isPositionInSelection([1, 0])).toBe(false); // Different row
    });

    it('should handle multi-line selections', () => {
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 5],
          initialSelectionExtent: [2, 3],
        }),
      );

      expect(result.current.isPositionInSelection([0, 7])).toBe(true); // First line
      expect(result.current.isPositionInSelection([1, 5])).toBe(true); // Middle line
      expect(result.current.isPositionInSelection([2, 1])).toBe(true); // Last line
      expect(result.current.isPositionInSelection([2, 5])).toBe(false); // After end
    });

    it('should get selected text from provided lines', () => {
      const lines = ['Hello world', 'Second line', 'Third line'];
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 6],
          initialSelectionExtent: [1, 6],
        }),
      );

      const selectedText = result.current.getSelectedText(lines);
      expect(selectedText).toBe('world\nSecond');
    });

    it('should return empty string when no selection for selected text', () => {
      const lines = ['Hello world'];
      const { result } = renderHook(() => useSelectionState());

      const selectedText = result.current.getSelectedText(lines);
      expect(selectedText).toBe('');
    });
  });

  describe('clipboard operations', () => {
    it('should copy selected text to clipboard', () => {
      const lines = ['Hello world', 'Second line'];
      const onClipboardChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 6],
          initialSelectionExtent: [1, 6],
          onClipboardChange,
        }),
      );

      act(() => {
        result.current.copyToClipboard(lines);
      });

      expect(result.current.clipboardContent).toBe('world\nSecond');
      expect(onClipboardChange).toHaveBeenCalledWith('world\nSecond');
    });

    it('should cut selected text to clipboard', () => {
      const lines = ['Hello world', 'Second line'];
      const onClipboardChange = vi.fn();
      const onCutText = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 6],
          initialSelectionExtent: [1, 6],
          onClipboardChange,
          onCutText,
        }),
      );

      act(() => {
        result.current.cutToClipboard(lines);
      });

      expect(result.current.clipboardContent).toBe('world\nSecond');
      expect(onClipboardChange).toHaveBeenCalledWith('world\nSecond');
      expect(onCutText).toHaveBeenCalledWith([0, 6], [1, 6]);
      // Selection should be cleared after cut
      expect(result.current.hasSelection).toBe(false);
    });

    it('should set clipboard content directly', () => {
      const onClipboardChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onClipboardChange }),
      );

      act(() => {
        result.current.setClipboardContent('pasted text');
      });

      expect(result.current.clipboardContent).toBe('pasted text');
      expect(onClipboardChange).toHaveBeenCalledWith('pasted text');
    });

    it('should not copy when no selection', () => {
      const lines = ['Hello world'];
      const onClipboardChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onClipboardChange }),
      );

      act(() => {
        result.current.copyToClipboard(lines);
      });

      expect(result.current.clipboardContent).toBe('');
      expect(onClipboardChange).not.toHaveBeenCalled();
    });
  });

  describe('special selection operations', () => {
    it('should select all text in provided bounds', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange }),
      );

      act(() => {
        result.current.selectAll(3, 25); // 3 lines, 25 chars max
      });

      expect(result.current.selectionAnchor).toEqual([0, 0]);
      expect(result.current.selectionExtent).toEqual([2, 25]); // Last line, end
      expect(result.current.hasSelection).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledWith([0, 0], [2, 25]);
    });

    it('should select current line', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange }),
      );

      act(() => {
        result.current.selectLine(1, 15); // Line 1, length 15
      });

      expect(result.current.selectionAnchor).toEqual([1, 0]);
      expect(result.current.selectionExtent).toEqual([1, 15]);
      expect(result.current.hasSelection).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledWith([1, 0], [1, 15]);
    });

    it('should select word at position', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange }),
      );

      // Simulate word boundaries - word "world" from pos 6 to 11
      act(() => {
        result.current.selectWord([0, 8], [0, 6], [0, 11]);
      });

      expect(result.current.selectionAnchor).toEqual([0, 6]);
      expect(result.current.selectionExtent).toEqual([0, 11]);
      expect(result.current.hasSelection).toBe(true);
      expect(onSelectionChange).toHaveBeenCalledWith([0, 6], [0, 11]);
    });
  });

  describe('callback coordination', () => {
    it('should call all relevant callbacks when selection changes', () => {
      const onSelectionChange = vi.fn();
      const onClipboardChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange, onClipboardChange }),
      );

      act(() => {
        result.current.setSelection([0, 6], [0, 11]);
      });

      expect(onSelectionChange).toHaveBeenCalledWith([0, 6], [0, 11]);

      const lines = ['Hello world'];
      act(() => {
        result.current.copyToClipboard(lines);
      });

      expect(onClipboardChange).toHaveBeenCalledWith('world');
    });

    it('should not call callbacks if disabled', () => {
      const onSelectionChange = vi.fn();
      const onClipboardChange = vi.fn();
      const { result } = renderHook(() =>
        useSelectionState({ onSelectionChange, onClipboardChange }),
      );

      act(() => {
        result.current.setSelection([0, 6], [0, 11], { skipCallbacks: true });
      });

      expect(result.current.hasSelection).toBe(true);
      expect(onSelectionChange).not.toHaveBeenCalled();

      const lines = ['Hello world'];
      act(() => {
        result.current.copyToClipboard(lines, { skipCallbacks: true });
      });

      expect(result.current.clipboardContent).toBe('world');
      expect(onClipboardChange).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle identical anchor and extent positions', () => {
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 5],
          initialSelectionExtent: [0, 5],
        }),
      );

      expect(result.current.hasSelection).toBe(false); // Zero-length selection

      const bounds = result.current.getSelectionBounds();
      expect(bounds).toBeNull();
    });

    it('should handle out-of-bounds positions gracefully', () => {
      const { result } = renderHook(() => useSelectionState());

      act(() => {
        result.current.setSelection([-1, -5], [100, 200]);
      });

      // Should still set the values as provided - bounds checking is caller's responsibility
      expect(result.current.selectionAnchor).toEqual([-1, -5]);
      expect(result.current.selectionExtent).toEqual([100, 200]);
      expect(result.current.hasSelection).toBe(true);
    });

    it('should handle empty lines array for text extraction', () => {
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 0],
          initialSelectionExtent: [0, 5],
        }),
      );

      const selectedText = result.current.getSelectedText([]);
      expect(selectedText).toBe('');
    });

    it('should handle single character selections', () => {
      const lines = ['Hello'];
      const { result } = renderHook(() =>
        useSelectionState({
          initialSelectionAnchor: [0, 1],
          initialSelectionExtent: [0, 2],
        }),
      );

      const selectedText = result.current.getSelectedText(lines);
      expect(selectedText).toBe('e');
    });
  });

  describe('performance and memoization', () => {
    it('should maintain stable output when inputs unchanged', () => {
      const { result, rerender } = renderHook(
        ({ trigger }) => {
          void trigger;
          return useSelectionState({
            initialSelectionAnchor: [0, 5],
            initialSelectionExtent: [0, 10],
          });
        },
        { initialProps: { trigger: 1 } },
      );

      const initialOutput = {
        selectionAnchor: result.current.selectionAnchor,
        selectionExtent: result.current.selectionExtent,
        hasSelection: result.current.hasSelection,
      };

      // Rerender without changing selection-affecting props
      rerender({ trigger: 2 });

      // Output should remain consistent
      expect(result.current.selectionAnchor).toEqual(
        initialOutput.selectionAnchor,
      );
      expect(result.current.selectionExtent).toEqual(
        initialOutput.selectionExtent,
      );
      expect(result.current.hasSelection).toBe(initialOutput.hasSelection);
    });
  });
});
