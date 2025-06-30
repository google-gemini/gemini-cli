/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHistoryState } from './useHistoryState.js';

describe('useHistoryState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty history stacks', () => {
      const { result } = renderHook(() => useHistoryState());

      expect(result.current.undoStack).toEqual([]);
      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should initialize with custom history limit', () => {
      const { result } = renderHook(() =>
        useHistoryState({ historyLimit: 50 }),
      );

      expect(result.current.undoStack).toEqual([]);
      expect(result.current.redoStack).toEqual([]);
    });

    it('should initialize with initial history if provided', () => {
      const initialUndo = [
        { lines: ['Line 1'], cursorRow: 0, cursorCol: 6 },
        { lines: ['Line 1', 'Line 2'], cursorRow: 1, cursorCol: 6 },
      ];

      const { result } = renderHook(() =>
        useHistoryState({ initialUndoStack: initialUndo }),
      );

      expect(result.current.undoStack).toEqual(initialUndo);
      expect(result.current.canUndo).toBe(true);
    });
  });

  describe('undo operations', () => {
    it('should push undo entry', () => {
      const onUndoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange }),
      );

      const entry = { lines: ['Hello world'], cursorRow: 0, cursorCol: 11 };

      act(() => {
        result.current.pushUndo(entry);
      });

      expect(result.current.undoStack).toEqual([entry]);
      expect(result.current.canUndo).toBe(true);
      expect(onUndoStackChange).toHaveBeenCalledWith([entry]);
    });

    it('should perform undo operation', () => {
      const onUndoStackChange = vi.fn();
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange, onRedoStackChange }),
      );

      const entry1 = { lines: ['Initial'], cursorRow: 0, cursorCol: 7 };
      const entry2 = { lines: ['Modified'], cursorRow: 0, cursorCol: 8 };

      // Push two entries
      act(() => {
        result.current.pushUndo(entry1);
        result.current.pushUndo(entry2);
      });

      // Undo the latest entry
      let undoResult: unknown;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult).toEqual(entry2);
      expect(result.current.undoStack).toEqual([entry1]);
      expect(result.current.redoStack).toEqual([entry2]);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
      expect(onUndoStackChange).toHaveBeenLastCalledWith([entry1]);
      expect(onRedoStackChange).toHaveBeenLastCalledWith([entry2]);
    });

    it('should return null when undoing with empty stack', () => {
      const { result } = renderHook(() => useHistoryState());

      let undoResult: unknown;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult).toBeNull();
      expect(result.current.undoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
    });

    it('should respect history limit', () => {
      const { result } = renderHook(() => useHistoryState({ historyLimit: 2 }));

      const entries = [
        { lines: ['First'], cursorRow: 0, cursorCol: 5 },
        { lines: ['Second'], cursorRow: 0, cursorCol: 6 },
        { lines: ['Third'], cursorRow: 0, cursorCol: 5 },
      ];

      act(() => {
        entries.forEach((entry) => result.current.pushUndo(entry));
      });

      // Should only keep the last 2 entries
      expect(result.current.undoStack).toEqual([entries[1], entries[2]]);
      expect(result.current.undoStack).toHaveLength(2);
    });
  });

  describe('redo operations', () => {
    it('should perform redo operation', () => {
      const onUndoStackChange = vi.fn();
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange, onRedoStackChange }),
      );

      const entry1 = { lines: ['Initial'], cursorRow: 0, cursorCol: 7 };
      const entry2 = { lines: ['Modified'], cursorRow: 0, cursorCol: 8 };

      // Setup undo/redo scenario
      act(() => {
        result.current.pushUndo(entry1);
        result.current.pushUndo(entry2);
      });

      act(() => {
        result.current.undo(); // Creates redo stack entry
      });

      // Redo the undone entry
      let redoResult: unknown;
      act(() => {
        redoResult = result.current.redo();
      });

      expect(redoResult).toEqual(entry2);
      expect(result.current.undoStack).toEqual([entry1, entry2]);
      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
      expect(onUndoStackChange).toHaveBeenLastCalledWith([entry1, entry2]);
      expect(onRedoStackChange).toHaveBeenLastCalledWith([]);
    });

    it('should return null when redoing with empty stack', () => {
      const { result } = renderHook(() => useHistoryState());

      let redoResult: unknown;
      act(() => {
        redoResult = result.current.redo();
      });

      expect(redoResult).toBeNull();
      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canRedo).toBe(false);
    });

    it('should clear redo stack when new undo is pushed', () => {
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onRedoStackChange }),
      );

      const entry1 = { lines: ['Initial'], cursorRow: 0, cursorCol: 7 };
      const entry2 = { lines: ['Modified'], cursorRow: 0, cursorCol: 8 };
      const entry3 = { lines: ['New'], cursorRow: 0, cursorCol: 3 };

      // Create undo/redo scenario
      act(() => {
        result.current.pushUndo(entry1);
        result.current.pushUndo(entry2);
      });

      act(() => {
        result.current.undo(); // entry2 goes to redo stack
      });

      expect(result.current.canRedo).toBe(true);

      // Push new undo should clear redo stack
      act(() => {
        result.current.pushUndo(entry3);
      });

      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canRedo).toBe(false);
      expect(onRedoStackChange).toHaveBeenLastCalledWith([]);
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple undo/redo operations', () => {
      const { result } = renderHook(() => useHistoryState());

      const entries = [
        { lines: ['State 1'], cursorRow: 0, cursorCol: 7 },
        { lines: ['State 2'], cursorRow: 0, cursorCol: 7 },
        { lines: ['State 3'], cursorRow: 0, cursorCol: 7 },
      ];

      // Build up undo stack
      act(() => {
        entries.forEach((entry) => result.current.pushUndo(entry));
      });

      expect(result.current.undoStack).toHaveLength(3);

      // Undo twice
      act(() => {
        result.current.undo(); // State 3 -> redo
      });

      act(() => {
        result.current.undo(); // State 2 -> redo
      });

      expect(result.current.undoStack).toEqual([entries[0]]);
      expect(result.current.redoStack).toEqual([entries[2], entries[1]]);

      // Redo once
      act(() => {
        result.current.redo(); // State 2 back to undo
      });

      expect(result.current.undoStack).toEqual([entries[0], entries[1]]);
      expect(result.current.redoStack).toEqual([entries[2]]);
    });

    it('should coordinate with external state through callbacks', () => {
      const onUndoStackChange = vi.fn();
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange, onRedoStackChange }),
      );

      const entry = { lines: ['Test'], cursorRow: 0, cursorCol: 4 };

      act(() => {
        result.current.pushUndo(entry);
      });

      expect(onUndoStackChange).toHaveBeenCalledWith([entry]);

      act(() => {
        result.current.undo();
      });

      expect(onUndoStackChange).toHaveBeenLastCalledWith([]);
      expect(onRedoStackChange).toHaveBeenLastCalledWith([entry]);
    });
  });

  describe('stack management utilities', () => {
    it('should clear undo stack', () => {
      const onUndoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange }),
      );

      // Add some entries
      act(() => {
        result.current.pushUndo({
          lines: ['Test'],
          cursorRow: 0,
          cursorCol: 4,
        });
        result.current.pushUndo({
          lines: ['Test 2'],
          cursorRow: 0,
          cursorCol: 6,
        });
      });

      expect(result.current.undoStack).toHaveLength(2);

      act(() => {
        result.current.clearUndoStack();
      });

      expect(result.current.undoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
      expect(onUndoStackChange).toHaveBeenLastCalledWith([]);
    });

    it('should clear redo stack', () => {
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onRedoStackChange }),
      );

      // Create redo entries
      act(() => {
        result.current.pushUndo({
          lines: ['Test'],
          cursorRow: 0,
          cursorCol: 4,
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.redoStack).toHaveLength(1);

      act(() => {
        result.current.clearRedoStack();
      });

      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canRedo).toBe(false);
      expect(onRedoStackChange).toHaveBeenLastCalledWith([]);
    });

    it('should clear both stacks', () => {
      const onUndoStackChange = vi.fn();
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange, onRedoStackChange }),
      );

      // Add entries to both stacks
      act(() => {
        result.current.pushUndo({
          lines: ['Test 1'],
          cursorRow: 0,
          cursorCol: 6,
        });
        result.current.pushUndo({
          lines: ['Test 2'],
          cursorRow: 0,
          cursorCol: 6,
        });
      });

      act(() => {
        result.current.undo(); // Creates redo entry
      });

      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.redoStack).toHaveLength(1);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.undoStack).toEqual([]);
      expect(result.current.redoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(onUndoStackChange).toHaveBeenLastCalledWith([]);
      expect(onRedoStackChange).toHaveBeenLastCalledWith([]);
    });
  });

  describe('history entry validation', () => {
    it('should handle entries with different cursor positions', () => {
      const { result } = renderHook(() => useHistoryState());

      const entries = [
        { lines: ['Hello'], cursorRow: 0, cursorCol: 0 },
        { lines: ['Hello', 'World'], cursorRow: 1, cursorCol: 5 },
        { lines: ['Hello', 'World', '!'], cursorRow: 2, cursorCol: 1 },
      ];

      act(() => {
        entries.forEach((entry) => result.current.pushUndo(entry));
      });

      expect(result.current.undoStack).toEqual(entries);

      let undoResult: unknown;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult).toEqual(entries[2]);
      expect(undoResult.cursorRow).toBe(2);
      expect(undoResult.cursorCol).toBe(1);
    });

    it('should handle entries with empty lines', () => {
      const { result } = renderHook(() => useHistoryState());

      const entry = { lines: [''], cursorRow: 0, cursorCol: 0 };

      act(() => {
        result.current.pushUndo(entry);
      });

      expect(result.current.undoStack).toEqual([entry]);

      let undoResult: unknown;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult).toEqual(entry);
      expect(undoResult.lines).toEqual(['']);
    });
  });

  describe('edge cases', () => {
    it('should handle zero history limit', () => {
      const { result } = renderHook(() => useHistoryState({ historyLimit: 0 }));

      act(() => {
        result.current.pushUndo({
          lines: ['Test'],
          cursorRow: 0,
          cursorCol: 4,
        });
      });

      // Should not store any history
      expect(result.current.undoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
    });

    it('should handle negative history limit', () => {
      const { result } = renderHook(() =>
        useHistoryState({ historyLimit: -1 }),
      );

      act(() => {
        result.current.pushUndo({
          lines: ['Test'],
          cursorRow: 0,
          cursorCol: 4,
        });
      });

      // Should treat as zero limit
      expect(result.current.undoStack).toEqual([]);
      expect(result.current.canUndo).toBe(false);
    });

    it('should handle very large history limit', () => {
      const { result } = renderHook(() =>
        useHistoryState({ historyLimit: 10000 }),
      );

      // Add many entries
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.pushUndo({
            lines: [`Line ${i}`],
            cursorRow: 0,
            cursorCol: `Line ${i}`.length,
          });
        }
      });

      expect(result.current.undoStack).toHaveLength(100);
      expect(result.current.canUndo).toBe(true);
    });
  });

  describe('callback coordination', () => {
    it('should not call callbacks if disabled', () => {
      const onUndoStackChange = vi.fn();
      const onRedoStackChange = vi.fn();
      const { result } = renderHook(() =>
        useHistoryState({ onUndoStackChange, onRedoStackChange }),
      );

      act(() => {
        result.current.pushUndo(
          { lines: ['Test'], cursorRow: 0, cursorCol: 4 },
          { skipCallbacks: true },
        );
      });

      expect(result.current.undoStack).toHaveLength(1);
      expect(onUndoStackChange).not.toHaveBeenCalled();

      act(() => {
        result.current.undo({ skipCallbacks: true });
      });

      expect(result.current.redoStack).toHaveLength(1);
      expect(onRedoStackChange).not.toHaveBeenCalled();
    });
  });
});
