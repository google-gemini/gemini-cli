/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTextState } from './useTextState.js';

describe('useTextState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty text by default', () => {
      const { result } = renderHook(() => useTextState({}));

      expect(result.current.lines).toEqual(['']);
      expect(result.current.text).toBe('');
      expect(result.current.undoStack).toEqual([]);
      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should initialize with provided text', () => {
      const initialText = 'Hello\nWorld\nTest';
      const { result } = renderHook(() => useTextState({ initialText }));

      expect(result.current.lines).toEqual(['Hello', 'World', 'Test']);
      expect(result.current.text).toBe('Hello\nWorld\nTest');
    });

    it('should handle single line initialization', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Single line' }),
      );

      expect(result.current.lines).toEqual(['Single line']);
      expect(result.current.text).toBe('Single line');
    });

    it('should handle empty string initialization', () => {
      const { result } = renderHook(() => useTextState({ initialText: '' }));

      expect(result.current.lines).toEqual(['']);
      expect(result.current.text).toBe('');
    });
  });

  describe('text operations', () => {
    it('should update text with updateText', () => {
      const { result } = renderHook(() => useTextState({}));

      act(() => {
        result.current.updateText(['Line 1', 'Line 2'], [1, 5]);
      });

      expect(result.current.lines).toEqual(['Line 1', 'Line 2']);
      expect(result.current.text).toBe('Line 1\nLine 2');
    });

    it('should update text with setText', () => {
      const { result } = renderHook(() => useTextState({}));

      act(() => {
        result.current.setText('New\nText\nContent');
      });

      expect(result.current.lines).toEqual(['New', 'Text', 'Content']);
      expect(result.current.text).toBe('New\nText\nContent');
    });

    it('should normalize line endings in setText', () => {
      const { result } = renderHook(() => useTextState({}));

      act(() => {
        result.current.setText('Windows\r\nMac\rUnix\n');
      });

      expect(result.current.lines).toEqual(['Windows', 'Mac', 'Unix', '']);
      expect(result.current.text).toBe('Windows\nMac\nUnix\n');
    });

    it('should handle empty setText', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Some text' }),
      );

      act(() => {
        result.current.setText('');
      });

      expect(result.current.lines).toEqual(['']);
      expect(result.current.text).toBe('');
    });
  });

  describe('onChange callback', () => {
    it('should call onChange when text is updated', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useTextState({ onChange }));

      act(() => {
        result.current.updateText(['New line'], [0, 8]);
      });

      expect(onChange).toHaveBeenCalledWith('New line');
    });

    it('should call onChange when text is set', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useTextState({ onChange }));

      act(() => {
        result.current.setText('Hello World');
      });

      expect(onChange).toHaveBeenCalledWith('Hello World');
    });

    it('should not call onChange if not provided', () => {
      const { result } = renderHook(() => useTextState({}));

      // Should not throw
      act(() => {
        result.current.updateText(['Test'], [0, 4]);
      });

      expect(result.current.text).toBe('Test');
    });
  });

  describe('undo functionality', () => {
    it('should push undo snapshot', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Initial' }),
      );

      act(() => {
        result.current.pushUndo([0, 7]);
      });

      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.undoStack[0]).toEqual({
        lines: ['Initial'],
        cursorRow: 0,
        cursorCol: 7,
      });
      expect(result.current.canUndo).toBe(true);
    });

    it('should perform undo operation', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Initial' }),
      );

      // Push undo snapshot
      act(() => {
        result.current.pushUndo([0, 7]);
      });

      // Change text
      act(() => {
        result.current.updateText(['Modified text'], [0, 13]);
      });

      // Undo
      let undoResult: unknown;
      act(() => {
        undoResult = result.current.undo([0, 13]); // Current cursor position
      });

      expect(undoResult).toEqual({
        lines: ['Initial'],
        cursor: [0, 7],
      });
      expect(result.current.lines).toEqual(['Initial']);
      expect(result.current.text).toBe('Initial');
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it('should return null for undo when no history', () => {
      const { result } = renderHook(() => useTextState({}));

      let undoResult: unknown;
      act(() => {
        undoResult = result.current.undo([0, 0]); // Current cursor position
      });

      expect(undoResult).toBeNull();
      expect(result.current.canUndo).toBe(false);
    });

    it('should clear redo stack when new operation is performed', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Initial' }),
      );

      // Create undo/redo scenario
      act(() => {
        result.current.pushUndo([0, 7]); // Save 'Initial' state
      });

      act(() => {
        result.current.updateText(['Modified'], [0, 8]); // Change to 'Modified'
      });

      act(() => {
        result.current.undo([0, 8]); // Undo to 'Initial', save 'Modified' to redo
      });

      expect(result.current.canRedo).toBe(true);

      // New operation should clear redo
      act(() => {
        result.current.pushUndo([0, 7]);
      });

      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('redo functionality', () => {
    it('should perform redo operation', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Initial' }),
      );

      // Setup undo/redo scenario
      act(() => {
        result.current.pushUndo([0, 7]); // Save 'Initial' state
      });

      act(() => {
        result.current.updateText(['Modified'], [0, 8]); // Change to 'Modified'
      });

      act(() => {
        result.current.undo([0, 8]); // Undo to 'Initial', save 'Modified' to redo
      });

      expect(result.current.canRedo).toBe(true);

      // Redo
      let redoResult: unknown;
      act(() => {
        redoResult = result.current.redo([0, 7]); // Provide current cursor
      });

      expect(redoResult).toEqual({
        lines: ['Modified'],
        cursor: [0, 8], // Cursor from when the modification was made
      });
      expect(result.current.lines).toEqual(['Modified']);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.canUndo).toBe(true);
    });

    it('should return null for redo when no history', () => {
      const { result } = renderHook(() => useTextState({}));

      let redoResult: unknown;
      act(() => {
        redoResult = result.current.redo([0, 0]); // Provide current cursor
      });

      expect(redoResult).toBeNull();
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('history limits', () => {
    it('should respect custom history limit', () => {
      const { result } = renderHook(() => useTextState({ historyLimit: 2 }));

      // Push 3 snapshots (should keep only 2)
      act(() => {
        result.current.pushUndo([0, 0]);
        result.current.pushUndo([0, 1]);
        result.current.pushUndo([0, 2]);
      });

      expect(result.current.undoStack).toHaveLength(2);
      expect(result.current.undoStack[0].cursorCol).toBe(1); // First one was removed
      expect(result.current.undoStack[1].cursorCol).toBe(2);
    });

    it('should use default history limit', () => {
      const { result } = renderHook(() => useTextState({}));

      // Push many snapshots
      act(() => {
        for (let i = 0; i < 102; i++) {
          result.current.pushUndo([0, i]);
        }
      });

      expect(result.current.undoStack).toHaveLength(100); // Default limit
    });
  });

  describe('memoization', () => {
    it('should memoize text computation', () => {
      const { result, rerender } = renderHook(() => useTextState({}));

      const initialText = result.current.text;

      // Rerender without changing lines
      rerender();

      expect(result.current.text).toBe(initialText); // Same reference
    });

    it('should update memoized text when lines change', () => {
      const { result } = renderHook(() => useTextState({}));

      const initialText = result.current.text;

      act(() => {
        result.current.updateText(['New content'], [0, 11]);
      });

      expect(result.current.text).not.toBe(initialText); // Different reference
      expect(result.current.text).toBe('New content');
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple undo/redo operations', () => {
      const { result } = renderHook(() =>
        useTextState({ initialText: 'Start' }),
      );

      // Sequence of operations with separate acts
      act(() => {
        result.current.pushUndo([0, 5]); // Save initial state
      });

      act(() => {
        result.current.updateText(['Change 1'], [0, 8]);
      });

      act(() => {
        result.current.pushUndo([0, 8]); // Save Change 1 state
      });

      act(() => {
        result.current.updateText(['Change 2'], [0, 8]);
      });

      act(() => {
        result.current.pushUndo([0, 8]); // Save Change 2 state
      });

      act(() => {
        result.current.updateText(['Change 3'], [0, 8]);
      });

      expect(result.current.text).toBe('Change 3');

      // Undo twice
      act(() => {
        result.current.undo([0, 8]); // Back to Change 2 (undo from Change 3)
      });

      expect(result.current.text).toBe('Change 2');

      act(() => {
        result.current.undo([0, 8]); // Back to Change 1 (undo from Change 2)
      });

      expect(result.current.text).toBe('Change 1');

      // Redo once
      act(() => {
        result.current.redo([0, 8]); // Forward to Change 2
      });

      expect(result.current.text).toBe('Change 2');
    });

    it('should coordinate with setText and undo/redo', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useTextState({ onChange }));

      act(() => {
        result.current.pushUndo([0, 0]); // Save initial empty state
      });

      act(() => {
        result.current.setText('First change');
      });

      act(() => {
        result.current.pushUndo([0, 12]); // Save 'First change' state
      });

      act(() => {
        result.current.setText('Second change');
      });

      expect(onChange).toHaveBeenCalledWith('Second change');

      act(() => {
        result.current.undo([0, 13]); // Provide current cursor
      });

      expect(result.current.text).toBe('First change');
    });
  });
});
