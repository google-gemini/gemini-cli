/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLogicalTextState } from './useLogicalTextState.js';

describe('useLogicalTextState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default empty state', () => {
      const { result } = renderHook(() => useLogicalTextState());

      expect(result.current.lines).toEqual(['']);
      expect(result.current.cursorRow).toBe(0);
      expect(result.current.cursorCol).toBe(0);
      expect(result.current.preferredCol).toBe(null);
    });

    it('should initialize with provided initial lines', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello', 'World'],
        }),
      );

      expect(result.current.lines).toEqual(['Hello', 'World']);
    });

    it('should handle empty lines array initialization', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({ initialLines: [] }),
      );

      expect(result.current.lines).toEqual(['']);
    });

    it('should initialize cursor position correctly', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello', 'World'],
          initialCursorRow: 1,
          initialCursorCol: 3,
        }),
      );

      expect(result.current.cursorRow).toBe(1);
      expect(result.current.cursorCol).toBe(3);
    });

    it('should clamp initial cursor to valid bounds', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello'],
          initialCursorRow: 5,
          initialCursorCol: 10, // Beyond text bounds
        }),
      );

      expect(result.current.cursorRow).toBe(0);
      expect(result.current.cursorCol).toBe(5); // End of line
    });
  });

  describe('Text Manipulation', () => {
    it('should update lines and maintain cursor coordination', () => {
      const onLinesChange = vi.fn();
      const { result } = renderHook(() =>
        useLogicalTextState({ onLinesChange }),
      );

      act(() => {
        result.current.setLines(['Hello', 'World']);
      });

      expect(result.current.lines).toEqual(['Hello', 'World']);
      expect(onLinesChange).toHaveBeenCalledWith(['Hello', 'World']);
    });

    it('should insert text at cursor position', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello World'],
          initialCursorRow: 0,
          initialCursorCol: 5,
        }),
      );

      act(() => {
        result.current.insertText(' Beautiful');
      });

      expect(result.current.lines[0]).toBe('Hello Beautiful World');
      expect(result.current.cursorCol).toBe(15); // After inserted text
    });

    it('should insert text across multiple lines', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Line 1', 'Line 2'],
          initialCursorRow: 0,
          initialCursorCol: 4,
        }),
      );

      act(() => {
        result.current.insertText(' A\nNew');
      });

      expect(result.current.lines).toEqual(['Line A', 'New 1', 'Line 2']);
      expect(result.current.cursorRow).toBe(1);
      expect(result.current.cursorCol).toBe(3); // After "New"
    });

    it('should delete character before cursor', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello World'],
          initialCursorRow: 0,
          initialCursorCol: 5,
        }),
      );

      act(() => {
        result.current.deleteCharBefore();
      });

      expect(result.current.lines[0]).toBe('Hell World');
      expect(result.current.cursorCol).toBe(4);
    });

    it('should delete character after cursor', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello World'],
          initialCursorRow: 0,
          initialCursorCol: 5,
        }),
      );

      act(() => {
        result.current.deleteCharAfter();
      });

      expect(result.current.lines[0]).toBe('HelloWorld');
      expect(result.current.cursorCol).toBe(5); // Cursor stays at same position
    });

    it('should join lines when deleting at start of line', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello', 'World'],
          initialCursorRow: 1,
          initialCursorCol: 0,
        }),
      );

      act(() => {
        result.current.deleteCharBefore();
      });

      expect(result.current.lines).toEqual(['HelloWorld']);
      expect(result.current.cursorRow).toBe(0);
      expect(result.current.cursorCol).toBe(5);
    });

    it('should join lines when deleting at end of line', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello', 'World'],
          initialCursorRow: 0,
          initialCursorCol: 5,
        }),
      );

      act(() => {
        result.current.deleteCharAfter();
      });

      expect(result.current.lines).toEqual(['HelloWorld']);
      expect(result.current.cursorRow).toBe(0);
      expect(result.current.cursorCol).toBe(5);
    });
  });

  describe('Cursor Management', () => {
    it('should move cursor to specified position', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({ initialLines: ['Hello', 'World', 'Test'] }),
      );

      act(() => {
        result.current.setCursor(1, 3);
      });

      expect(result.current.cursorRow).toBe(1);
      expect(result.current.cursorCol).toBe(3);
    });

    it('should clamp cursor position to valid bounds', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({ initialLines: ['Hello', 'World'] }),
      );

      act(() => {
        result.current.setCursor(5, 10); // Beyond bounds
      });

      expect(result.current.cursorRow).toBe(1);
      expect(result.current.cursorCol).toBe(5); // End of last line
    });

    it('should set preferred column', () => {
      const { result } = renderHook(() => useLogicalTextState());

      act(() => {
        result.current.setPreferredCol(10);
      });

      expect(result.current.preferredCol).toBe(10);
    });

    it('should clear preferred column', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({ initialPreferredCol: 5 }),
      );

      expect(result.current.preferredCol).toBe(5);

      act(() => {
        result.current.setPreferredCol(null);
      });

      expect(result.current.preferredCol).toBe(null);
    });
  });

  describe('Utility Functions', () => {
    it('should get current line', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello', 'World'],
          initialCursorRow: 1,
        }),
      );

      expect(result.current.getCurrentLine()).toBe('World');
    });

    it('should get current line length', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello', 'World'],
          initialCursorRow: 1,
        }),
      );

      expect(result.current.getCurrentLineLength()).toBe(5);
    });

    it('should detect if at start of line', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello'],
          initialCursorRow: 0,
          initialCursorCol: 0,
        }),
      );

      expect(result.current.isAtStartOfLine()).toBe(true);

      act(() => {
        result.current.setCursor(0, 2);
      });

      expect(result.current.isAtStartOfLine()).toBe(false);
    });

    it('should detect if at end of line', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello'],
          initialCursorRow: 0,
          initialCursorCol: 5,
        }),
      );

      expect(result.current.isAtEndOfLine()).toBe(true);

      act(() => {
        result.current.setCursor(0, 2);
      });

      expect(result.current.isAtEndOfLine()).toBe(false);
    });
  });

  describe('Unicode Support', () => {
    it('should handle emoji correctly in text operations', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello 👋 World'],
          initialCursorRow: 0,
          initialCursorCol: 7,
        }),
      );

      expect(result.current.cursorCol).toBe(7);

      act(() => {
        result.current.insertText('🌟');
      });

      expect(result.current.lines[0]).toBe('Hello 👋🌟 World');
      expect(result.current.cursorCol).toBe(8);
    });

    it('should handle multi-byte Unicode characters', () => {
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello 𝒳 World'],
          initialCursorRow: 0,
          initialCursorCol: 7,
        }),
      );

      act(() => {
        result.current.deleteCharBefore();
      });

      expect(result.current.lines[0]).toBe('Hello  World');
      expect(result.current.cursorCol).toBe(6);
    });
  });

  describe('Change Callbacks', () => {
    it('should call onLinesChange when lines change', () => {
      const onLinesChange = vi.fn();
      const { result } = renderHook(() =>
        useLogicalTextState({ onLinesChange }),
      );

      act(() => {
        result.current.setLines(['New line']);
      });

      expect(onLinesChange).toHaveBeenCalledWith(['New line']);
    });

    it('should call onCursorChange when cursor moves', () => {
      const onCursorChange = vi.fn();
      const { result } = renderHook(() =>
        useLogicalTextState({
          initialLines: ['Hello World'],
          onCursorChange,
        }),
      );

      act(() => {
        result.current.setCursor(0, 5);
      });

      expect(onCursorChange).toHaveBeenCalledWith(0, 5);
    });

    it('should skip callbacks when requested', () => {
      const onLinesChange = vi.fn();
      const onCursorChange = vi.fn();
      const { result } = renderHook(() =>
        useLogicalTextState({ onLinesChange, onCursorChange }),
      );

      onLinesChange.mockClear();
      onCursorChange.mockClear();

      act(() => {
        result.current.insertText('test', { skipCallbacks: true });
      });

      expect(onLinesChange).not.toHaveBeenCalled();
      expect(onCursorChange).not.toHaveBeenCalled();
    });
  });

  describe('Performance and Memoization', () => {
    it('should provide stable function references', () => {
      const { result, rerender } = renderHook(() => useLogicalTextState());

      const initialFunctions = {
        setLines: result.current.setLines,
        insertText: result.current.insertText,
        deleteCharBefore: result.current.deleteCharBefore,
        deleteCharAfter: result.current.deleteCharAfter,
        setCursor: result.current.setCursor,
        setPreferredCol: result.current.setPreferredCol,
        getCurrentLine: result.current.getCurrentLine,
        getCurrentLineLength: result.current.getCurrentLineLength,
        isAtStartOfLine: result.current.isAtStartOfLine,
        isAtEndOfLine: result.current.isAtEndOfLine,
      };

      rerender();

      expect(result.current.setLines).toBe(initialFunctions.setLines);
      expect(result.current.insertText).toBe(initialFunctions.insertText);
      expect(result.current.deleteCharBefore).toBe(
        initialFunctions.deleteCharBefore,
      );
      expect(result.current.deleteCharAfter).toBe(
        initialFunctions.deleteCharAfter,
      );
      expect(result.current.setCursor).toBe(initialFunctions.setCursor);
      expect(result.current.setPreferredCol).toBe(
        initialFunctions.setPreferredCol,
      );
      expect(result.current.getCurrentLine).toBe(
        initialFunctions.getCurrentLine,
      );
      expect(result.current.getCurrentLineLength).toBe(
        initialFunctions.getCurrentLineLength,
      );
      expect(result.current.isAtStartOfLine).toBe(
        initialFunctions.isAtStartOfLine,
      );
      expect(result.current.isAtEndOfLine).toBe(initialFunctions.isAtEndOfLine);
    });
  });
});
