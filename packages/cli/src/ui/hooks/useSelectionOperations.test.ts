/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionOperations } from './useSelectionOperations.js';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type { UseSelectionStateReturn, Position } from './useSelectionState.js';

// Mock dependencies
vi.mock('./useLogicalTextState.js');
vi.mock('./useSelectionState.js');

describe('useSelectionOperations', () => {
  // Mock state hooks
  let mockLogicalState: Partial<UseLogicalTextStateReturn>;
  let mockSelectionState: Partial<UseSelectionStateReturn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock logical text state
    mockLogicalState = {
      lines: ['hello world', 'second line'],
      cursorRow: 0,
      cursorCol: 5,
      preferredCol: null,
      insertText: vi.fn(),
      setLines: vi.fn(),
      setCursor: vi.fn(),
      setPreferredCol: vi.fn(),
      getCurrentLine: vi.fn(() => 'hello world'),
      getCurrentLineLength: vi.fn(() => 11),
    };

    // Setup mock selection state
    mockSelectionState = {
      selectionAnchor: [0, 0],
      selectionExtent: [0, 5],
      hasSelection: true,
      clipboardContent: '',
      setSelection: vi.fn(),
      setSelectionAnchor: vi.fn(),
      setSelectionExtent: vi.fn(),
      clearSelection: vi.fn(),
      getSelectionBounds: vi.fn(() => ({ start: [0, 0], end: [0, 5] })),
      isPositionInSelection: vi.fn(),
      getSelectedText: vi.fn(() => 'hello'),
      copyToClipboard: vi.fn(),
      cutToClipboard: vi.fn(),
      setClipboardContent: vi.fn(),
      selectAll: vi.fn(),
      selectLine: vi.fn(),
      selectWord: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('copy', () => {
    it('should not fail - useSelectionOperations is now implemented', () => {
      expect(() => {
        renderHook(() =>
          useSelectionOperations(
            mockLogicalState as UseLogicalTextStateReturn,
            mockSelectionState as UseSelectionStateReturn,
          ),
        );
      }).not.toThrow();
    });

    it('should copy selected text to clipboard', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const copiedText = result.current.copy();
        expect(copiedText).toBe('hello');
      });

      expect(mockSelectionState.copyToClipboard).toHaveBeenCalledWith(
        ['hello world', 'second line'],
        { skipCallbacks: undefined },
      );
      expect(mockSelectionState.getSelectedText).toHaveBeenCalledWith([
        'hello world',
        'second line',
      ]);
    });

    it('should return null when no selection', () => {
      mockSelectionState.hasSelection = false;
      mockSelectionState.getSelectedText = vi.fn(() => '');

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const copiedText = result.current.copy();
        expect(copiedText).toBe(null);
      });

      expect(mockSelectionState.copyToClipboard).not.toHaveBeenCalled();
    });

    it('should handle empty selection', () => {
      mockSelectionState.selectionAnchor = [0, 5];
      mockSelectionState.selectionExtent = [0, 5];
      mockSelectionState.hasSelection = false;
      mockSelectionState.getSelectedText = vi.fn(() => '');

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const copiedText = result.current.copy();
        expect(copiedText).toBe(null);
      });
    });

    it('should handle multi-line selection', () => {
      mockSelectionState.selectionAnchor = [0, 6];
      mockSelectionState.selectionExtent = [1, 6];
      mockSelectionState.getSelectedText = vi.fn(() => 'world\nsecond');

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const copiedText = result.current.copy();
        expect(copiedText).toBe('world\nsecond');
      });

      expect(mockSelectionState.copyToClipboard).toHaveBeenCalledWith(
        ['hello world', 'second line'],
        { skipCallbacks: undefined },
      );
    });
  });

  describe('paste', () => {
    it('should paste clipboard content at cursor', () => {
      mockSelectionState.clipboardContent = 'pasted text';

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const success = result.current.paste();
        expect(success).toBe(true);
      });

      expect(mockLogicalState.insertText).toHaveBeenCalledWith('pasted text', {
        skipCallbacks: undefined,
      });
    });

    it('should return false when clipboard is empty', () => {
      mockSelectionState.clipboardContent = '';

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const success = result.current.paste();
        expect(success).toBe(false);
      });

      expect(mockLogicalState.insertText).not.toHaveBeenCalled();
    });

    it('should handle multi-line paste', () => {
      mockSelectionState.clipboardContent = 'line1\nline2\nline3';

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const success = result.current.paste();
        expect(success).toBe(true);
      });

      expect(mockLogicalState.insertText).toHaveBeenCalledWith(
        'line1\nline2\nline3',
        { skipCallbacks: undefined },
      );
    });

    it('should handle whitespace-only clipboard content', () => {
      mockSelectionState.clipboardContent = '   \n\t  ';

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        const success = result.current.paste();
        expect(success).toBe(true);
      });

      expect(mockLogicalState.insertText).toHaveBeenCalledWith('   \n\t  ', {
        skipCallbacks: undefined,
      });
    });
  });

  describe('startSelection', () => {
    it('should set selection anchor to current cursor position', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.startSelection();
      });

      expect(mockSelectionState.setSelectionAnchor).toHaveBeenCalledWith(
        [0, 5],
        { skipCallbacks: undefined },
      );
    });

    it('should handle cursor at different positions', () => {
      mockLogicalState.cursorRow = 1;
      mockLogicalState.cursorCol = 8;

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.startSelection();
      });

      expect(mockSelectionState.setSelectionAnchor).toHaveBeenCalledWith(
        [1, 8],
        { skipCallbacks: undefined },
      );
    });

    it('should handle cursor at line boundaries', () => {
      mockLogicalState.cursorRow = 0;
      mockLogicalState.cursorCol = 0;

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.startSelection();
      });

      expect(mockSelectionState.setSelectionAnchor).toHaveBeenCalledWith(
        [0, 0],
        { skipCallbacks: undefined },
      );
    });

    it('should handle cursor at end of line', () => {
      mockLogicalState.cursorRow = 0;
      mockLogicalState.cursorCol = 11; // end of 'hello world'

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.startSelection();
      });

      expect(mockSelectionState.setSelectionAnchor).toHaveBeenCalledWith(
        [0, 11],
        { skipCallbacks: undefined },
      );
    });
  });

  describe('cut functionality', () => {
    it('should cut selected text and update cursor position', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      // Mock the cut operation to simulate removing text
      const cutCallback = vi.fn((_start: Position, _end: Position) => {
        // Simulate text removal by calling the logical state
        mockLogicalState.setLines?.(['world', 'second line']);
        mockLogicalState.setCursor?.(0, 0);
      });

      mockSelectionState.cutToClipboard = vi.fn((_lines, _options) => {
        cutCallback([0, 0], [0, 5]);
      });

      act(() => {
        result.current.cut?.();
      });

      expect(mockSelectionState.cutToClipboard).toHaveBeenCalledWith(
        ['hello world', 'second line'],
        { skipCallbacks: undefined },
      );
    });
  });

  describe('selection utilities exposed', () => {
    it('should expose selection state properties', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      expect(result.current.hasSelection).toBe(true);
      expect(result.current.selectionAnchor).toEqual([0, 0]);
      expect(result.current.selectionExtent).toEqual([0, 5]);
      expect(result.current.clipboardContent).toBe('');
    });

    it('should expose selection utility functions', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      const position: Position = [0, 3];

      act(() => {
        result.current.isPositionInSelection(position);
      });

      expect(mockSelectionState.isPositionInSelection).toHaveBeenCalledWith(
        position,
      );
    });

    it('should expose selection management functions', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.clearSelection();
      });

      expect(mockSelectionState.clearSelection).toHaveBeenCalledWith({
        skipCallbacks: undefined,
      });
    });

    it('should expose special selection operations', () => {
      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.selectAll();
      });

      // Should calculate total lines and last line length
      expect(mockSelectionState.selectAll).toHaveBeenCalledWith(2, 11, {
        skipCallbacks: undefined,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty document', () => {
      mockLogicalState.lines = [''];
      mockLogicalState.cursorRow = 0;
      mockLogicalState.cursorCol = 0;

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.startSelection();
      });

      expect(mockSelectionState.setSelectionAnchor).toHaveBeenCalledWith(
        [0, 0],
        { skipCallbacks: undefined },
      );
    });

    it('should handle invalid cursor position gracefully', () => {
      mockLogicalState.cursorRow = -1;
      mockLogicalState.cursorCol = -1;

      const { result } = renderHook(() =>
        useSelectionOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockSelectionState as UseSelectionStateReturn,
        ),
      );

      act(() => {
        result.current.startSelection();
      });

      // Should still call with the current cursor position
      expect(mockSelectionState.setSelectionAnchor).toHaveBeenCalledWith(
        [-1, -1],
        { skipCallbacks: undefined },
      );
    });
  });
});
