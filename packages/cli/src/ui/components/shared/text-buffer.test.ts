/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import stripAnsi from 'strip-ansi';
import { renderHook, act } from '@testing-library/react';
import type {
  Viewport,
  TextBuffer,
  TextBufferState,
  TextBufferAction,
} from './text-buffer.js';
import {
  useTextBuffer,
  offsetToLogicalPos,
  logicalPosToOffset,
  textBufferReducer,
  findWordEndInLine,
  findNextWordStartInLine,
  isWordCharStrict,
} from './text-buffer.js';
import { cpLen } from '../../utils/textUtils.js';

const initialState: TextBufferState = {
  lines: [''],
  cursorRow: 0,
  cursorCol: 0,
  preferredCol: null,
  undoStack: [],
  redoStack: [],
  clipboard: null,
  selectionAnchor: null,
};

describe('textBufferReducer', () => {
  it('should return the initial state if state is undefined', () => {
    const action = { type: 'unknown_action' } as unknown as TextBufferAction;
    const state = textBufferReducer(initialState, action);
    expect(state).toHaveOnlyValidCharacters();
    expect(state).toEqual(initialState);
  });

  describe('set_text action', () => {
    it('should set new text and move cursor to the end', () => {
      const action: TextBufferAction = {
        type: 'set_text',
        payload: 'hello\nworld',
      };
      const state = textBufferReducer(initialState, action);
      expect(state).toHaveOnlyValidCharacters();
      expect(state.lines).toEqual(['hello', 'world']);
      expect(state.cursorRow).toBe(1);
      expect(state.cursorCol).toBe(5);
      expect(state.undoStack.length).toBe(1);
    });

    it('should not create an undo snapshot if pushToUndo is false', () => {
      const action: TextBufferAction = {
        type: 'set_text',
        payload: 'no undo',
        pushToUndo: false,
      };
      const state = textBufferReducer(initialState, action);
      expect(state).toHaveOnlyValidCharacters();
      expect(state.lines).toEqual(['no undo']);
      expect(state.undoStack.length).toBe(0);
    });
  });

  describe('insert action', () => {
    it('should insert a character', () => {
      const action: TextBufferAction = { type: 'insert', payload: 'a' };
      const state = textBufferReducer(initialState, action);
      expect(state).toHaveOnlyValidCharacters();
      expect(state.lines).toEqual(['a']);
      expect(state.cursorCol).toBe(1);
    });

    it('should insert a newline', () => {
      const stateWithText = { ...initialState, lines: ['hello'] };
      const action: TextBufferAction = { type: 'insert', payload: '\n' };
      const state = textBufferReducer(stateWithText, action);
      expect(state).toHaveOnlyValidCharacters();
      expect(state.lines).toEqual(['', 'hello']);
      expect(state.cursorRow).toBe(1);
      expect(state.cursorCol).toBe(0);
    });
  });

  describe('backspace action', () => {
    it('should remove a character', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['a'],
        cursorRow: 0,
        cursorCol: 1,
      };
      const action: TextBufferAction = { type: 'backspace' };
      const state = textBufferReducer(stateWithText, action);
      expect(state).toHaveOnlyValidCharacters();
      expect(state.lines).toEqual(['']);
      expect(state.cursorCol).toBe(0);
    });

    it('should join lines if at the beginning of a line', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello', 'world'],
        cursorRow: 1,
        cursorCol: 0,
      };
      const action: TextBufferAction = { type: 'backspace' };
      const state = textBufferReducer(stateWithText, action);
      expect(state).toHaveOnlyValidCharacters();
      expect(state.lines).toEqual(['helloworld']);
      expect(state.cursorRow).toBe(0);
      expect(state.cursorCol).toBe(5);
    });
  });

  describe('undo/redo actions', () => {
    it('should undo and redo a change', () => {
      // 1. Insert text
      const insertAction: TextBufferAction = {
        type: 'insert',
        payload: 'test',
      };
      const stateAfterInsert = textBufferReducer(initialState, insertAction);
      expect(stateAfterInsert).toHaveOnlyValidCharacters();
      expect(stateAfterInsert.lines).toEqual(['test']);
      expect(stateAfterInsert.undoStack.length).toBe(1);

      // 2. Undo
      const undoAction: TextBufferAction = { type: 'undo' };
      const stateAfterUndo = textBufferReducer(stateAfterInsert, undoAction);
      expect(stateAfterUndo).toHaveOnlyValidCharacters();
      expect(stateAfterUndo.lines).toEqual(['']);
      expect(stateAfterUndo.undoStack.length).toBe(0);
      expect(stateAfterUndo.redoStack.length).toBe(1);

      // 3. Redo
      const redoAction: TextBufferAction = { type: 'redo' };
      const stateAfterRedo = textBufferReducer(stateAfterUndo, redoAction);
      expect(stateAfterRedo).toHaveOnlyValidCharacters();
      expect(stateAfterRedo.lines).toEqual(['test']);
      expect(stateAfterRedo.undoStack.length).toBe(1);
      expect(stateAfterRedo.redoStack.length).toBe(0);
    });
  });

  describe('create_undo_snapshot action', () => {
    it('should create a snapshot without changing state', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello'],
        cursorRow: 0,
        cursorCol: 5,
      };
      const action: TextBufferAction = { type: 'create_undo_snapshot' };
      const state = textBufferReducer(stateWithText, action);
      expect(state).toHaveOnlyValidCharacters();

      expect(state.lines).toEqual(['hello']);
      expect(state.cursorRow).toBe(0);
      expect(state.cursorCol).toBe(5);
      expect(state.undoStack.length).toBe(1);
      expect(state.undoStack[0].lines).toEqual(['hello']);
      expect(state.undoStack[0].cursorRow).toBe(0);
      expect(state.undoStack[0].cursorCol).toBe(5);
    });
  });

  describe('delete_word_left action', () => {
    it('should delete a simple word', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello world'],
        cursorRow: 0,
        cursorCol: 11,
      };
      const action: TextBufferAction = { type: 'delete_word_left' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['hello ']);
      expect(state.cursorCol).toBe(6);
    });

    it('should delete a path segment', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['path/to/file'],
        cursorRow: 0,
        cursorCol: 12,
      };
      const action: TextBufferAction = { type: 'delete_word_left' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['path/to/']);
      expect(state.cursorCol).toBe(8);
    });

    it('should delete variable_name parts', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['variable_name'],
        cursorRow: 0,
        cursorCol: 13,
      };
      const action: TextBufferAction = { type: 'delete_word_left' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['variable_']);
      expect(state.cursorCol).toBe(9);
    });

    it('should act like backspace at the beginning of a line', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello', 'world'],
        cursorRow: 1,
        cursorCol: 0,
      };
      const action: TextBufferAction = { type: 'delete_word_left' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['helloworld']);
      expect(state.cursorRow).toBe(0);
      expect(state.cursorCol).toBe(5);
    });
  });

  describe('delete_word_right action', () => {
    it('should delete a simple word', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello world'],
        cursorRow: 0,
        cursorCol: 0,
      };
      const action: TextBufferAction = { type: 'delete_word_right' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['world']);
      expect(state.cursorCol).toBe(0);
    });

    it('should delete a path segment', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['path/to/file'],
        cursorRow: 0,
        cursorCol: 0,
      };
      const action: TextBufferAction = { type: 'delete_word_right' };
      let state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['/to/file']);
      state = textBufferReducer(state, action);
      expect(state.lines).toEqual(['to/file']);
    });

    it('should delete variable_name parts', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['variable_name'],
        cursorRow: 0,
        cursorCol: 0,
      };
      const action: TextBufferAction = { type: 'delete_word_right' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['_name']);
      expect(state.cursorCol).toBe(0);
    });

    it('should act like delete at the end of a line', () => {
      const stateWithText: TextBufferState = {
        ...initialState,
        lines: ['hello', 'world'],
        cursorRow: 0,
        cursorCol: 5,
      };
      const action: TextBufferAction = { type: 'delete_word_right' };
      const state = textBufferReducer(stateWithText, action);
      expect(state.lines).toEqual(['helloworld']);
      expect(state.cursorRow).toBe(0);
      expect(state.cursorCol).toBe(5);
    });
  });
});

// Helper to get the state from the hook
const getBufferState = (result: { current: TextBuffer }) => {
  expect(result.current).toHaveOnlyValidCharacters();
  return {
    text: result.current.text,
    lines: [...result.current.lines], // Clone for safety
    cursor: [...result.current.cursor] as [number, number],
    allVisualLines: [...result.current.allVisualLines],
    viewportVisualLines: [...result.current.viewportVisualLines],
    visualCursor: [...result.current.visualCursor] as [number, number],
    visualScrollRow: result.current.visualScrollRow,
    preferredCol: result.current.preferredCol,
  };
};

describe('useTextBuffer', () => {
  let viewport: Viewport;

  beforeEach(() => {
    viewport = { width: 10, height: 3 }; // Default viewport for tests
  });

  describe('Initialization', () => {
    it('should initialize with empty text and cursor at (0,0) by default', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('');
      expect(state.lines).toEqual(['']);
      expect(state.cursor).toEqual([0, 0]);
      expect(state.allVisualLines).toEqual(['']);
      expect(state.viewportVisualLines).toEqual(['']);
      expect(state.visualCursor).toEqual([0, 0]);
      expect(state.visualScrollRow).toBe(0);
    });

    it('should initialize with provided initialText', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello',
          viewport,
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('hello');
      expect(state.lines).toEqual(['hello']);
      expect(state.cursor).toEqual([0, 0]); // Default cursor if offset not given
      expect(state.allVisualLines).toEqual(['hello']);
      expect(state.viewportVisualLines).toEqual(['hello']);
      expect(state.visualCursor).toEqual([0, 0]);
    });

    it('should initialize with initialText and initialCursorOffset', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello\nworld',
          initialCursorOffset: 7, // Should be at 'o' in 'world'
          viewport,
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('hello\nworld');
      expect(state.lines).toEqual(['hello', 'world']);
      expect(state.cursor).toEqual([1, 1]); // Logical cursor at 'o' in "world"
      expect(state.allVisualLines).toEqual(['hello', 'world']);
      expect(state.viewportVisualLines).toEqual(['hello', 'world']);
      expect(state.visualCursor[0]).toBe(1); // On the second visual line
      expect(state.visualCursor[1]).toBe(1); // At 'o' in "world"
    });

    it('should wrap visual lines', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'The quick brown fox jumps over the lazy dog.',
          initialCursorOffset: 2, // After '好'
          viewport: { width: 15, height: 4 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.allVisualLines).toEqual([
        'The quick',
        'brown fox',
        'jumps over the',
        'lazy dog.',
      ]);
    });

    it('should wrap visual lines with multiple spaces', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'The  quick  brown fox    jumps over the lazy dog.',
          viewport: { width: 15, height: 4 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      // Including multiple spaces at the end of the lines like this is
      // consistent with Google docs behavior and makes it intuitive to edit
      // the spaces as needed.
      expect(state.allVisualLines).toEqual([
        'The  quick ',
        'brown fox   ',
        'jumps over the',
        'lazy dog.',
      ]);
    });

    it('should wrap visual lines even without spaces', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '123456789012345ABCDEFG', // 4 chars, 12 bytes
          viewport: { width: 15, height: 2 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      // Including multiple spaces at the end of the lines like this is
      // consistent with Google docs behavior and makes it intuitive to edit
      // the spaces as needed.
      expect(state.allVisualLines).toEqual(['123456789012345', 'ABCDEFG']);
    });

    it('should initialize with multi-byte unicode characters and correct cursor offset', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '你好世界', // 4 chars, 12 bytes
          initialCursorOffset: 2, // After '好'
          viewport: { width: 5, height: 2 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      expect(state.text).toBe('你好世界');
      expect(state.lines).toEqual(['你好世界']);
      expect(state.cursor).toEqual([0, 2]);
      // Visual: "你好" (width 4), "世"界" (width 4) with viewport width 5
      expect(state.allVisualLines).toEqual(['你好', '世界']);
      expect(state.visualCursor).toEqual([1, 0]);
    });
  });

  describe('Basic Editing', () => {
    it('insert: should insert a character and update cursor', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() => result.current.insert('a'));
      let state = getBufferState(result);
      expect(state.text).toBe('a');
      expect(state.cursor).toEqual([0, 1]);
      expect(state.visualCursor).toEqual([0, 1]);

      act(() => result.current.insert('b'));
      state = getBufferState(result);
      expect(state.text).toBe('ab');
      expect(state.cursor).toEqual([0, 2]);
      expect(state.visualCursor).toEqual([0, 2]);
    });

    it('insert: should insert text in the middle of a line', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abc',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('right'));
      act(() => result.current.insert('-NEW-'));
      const state = getBufferState(result);
      expect(state.text).toBe('a-NEW-bc');
      expect(state.cursor).toEqual([0, 6]);
    });

    it('newline: should create a new line and move cursor', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'ab',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // cursor at [0,2]
      act(() => result.current.newline());
      const state = getBufferState(result);
      expect(state.text).toBe('ab\n');
      expect(state.lines).toEqual(['ab', '']);
      expect(state.cursor).toEqual([1, 0]);
      expect(state.allVisualLines).toEqual(['ab', '']);
      expect(state.viewportVisualLines).toEqual(['ab', '']); // viewport height 3
      expect(state.visualCursor).toEqual([1, 0]); // On the new visual line
    });

    it('backspace: should delete char to the left or merge lines', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'a\nb',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => {
        result.current.move('down');
      });
      act(() => {
        result.current.move('end'); // cursor to [1,1] (end of 'b')
      });
      act(() => result.current.backspace()); // delete 'b'
      let state = getBufferState(result);
      expect(state.text).toBe('a\n');
      expect(state.cursor).toEqual([1, 0]);

      act(() => result.current.backspace()); // merge lines
      state = getBufferState(result);
      expect(state.text).toBe('a');
      expect(state.cursor).toEqual([0, 1]); // cursor after 'a'
      expect(state.allVisualLines).toEqual(['a']);
      expect(state.viewportVisualLines).toEqual(['a']);
      expect(state.visualCursor).toEqual([0, 1]);
    });

    it('del: should delete char to the right or merge lines', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'a\nb',
          viewport,
          isValidPath: () => false,
        }),
      );
      // cursor at [0,0]
      act(() => result.current.del()); // delete 'a'
      let state = getBufferState(result);
      expect(state.text).toBe('\nb');
      expect(state.cursor).toEqual([0, 0]);

      act(() => result.current.del()); // merge lines (deletes newline)
      state = getBufferState(result);
      expect(state.text).toBe('b');
      expect(state.cursor).toEqual([0, 0]);
      expect(state.allVisualLines).toEqual(['b']);
      expect(state.viewportVisualLines).toEqual(['b']);
      expect(state.visualCursor).toEqual([0, 0]);
    });
  });

  describe('Drag and Drop File Paths', () => {
    it('should prepend @ to a valid file path on insert', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => true }),
      );
      const filePath = '/path/to/a/valid/file.txt';
      act(() => result.current.insert(filePath, { paste: true }));
      expect(getBufferState(result).text).toBe(`@${filePath} `);
    });

    it('should not prepend @ to an invalid file path on insert', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const notAPath = 'this is just some long text';
      act(() => result.current.insert(notAPath, { paste: true }));
      expect(getBufferState(result).text).toBe(notAPath);
    });

    it('should handle quoted paths', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => true }),
      );
      const filePath = "'/path/to/a/valid/file.txt'";
      act(() => result.current.insert(filePath, { paste: true }));
      expect(getBufferState(result).text).toBe(`@/path/to/a/valid/file.txt `);
    });

    it('should not prepend @ to short text that is not a path', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => true }),
      );
      const shortText = 'ab';
      act(() => result.current.insert(shortText, { paste: true }));
      expect(getBufferState(result).text).toBe(shortText);
    });
  });

  describe('Shell Mode Behavior', () => {
    it('should not prepend @ to valid file paths when shellModeActive is true', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => true,
          shellModeActive: true,
        }),
      );
      const filePath = '/path/to/a/valid/file.txt';
      act(() => result.current.insert(filePath, { paste: true }));
      expect(getBufferState(result).text).toBe(filePath); // No @ prefix
    });

    it('should not prepend @ to quoted paths when shellModeActive is true', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => true,
          shellModeActive: true,
        }),
      );
      const quotedFilePath = "'/path/to/a/valid/file.txt'";
      act(() => result.current.insert(quotedFilePath, { paste: true }));
      expect(getBufferState(result).text).toBe(quotedFilePath); // No @ prefix, keeps quotes
    });

    it('should behave normally with invalid paths when shellModeActive is true', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => false,
          shellModeActive: true,
        }),
      );
      const notAPath = 'this is just some text';
      act(() => result.current.insert(notAPath, { paste: true }));
      expect(getBufferState(result).text).toBe(notAPath);
    });

    it('should behave normally with short text when shellModeActive is true', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          viewport,
          isValidPath: () => true,
          shellModeActive: true,
        }),
      );
      const shortText = 'ls';
      act(() => result.current.insert(shortText, { paste: true }));
      expect(getBufferState(result).text).toBe(shortText); // No @ prefix for short text
    });
  });

  describe('Cursor Movement', () => {
    it('move: left/right should work within and across visual lines (due to wrapping)', () => {
      // Text: "long line1next line2" (20 chars)
      // Viewport width 5. Word wrapping should produce:
      // "long " (5)
      // "line1" (5)
      // "next " (5)
      // "line2" (5)
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'long line1next line2', // Corrected: was 'long line1next line2'
          viewport: { width: 5, height: 4 },
          isValidPath: () => false,
        }),
      );
      // Initial cursor [0,0] logical, visual [0,0] ("l" of "long ")

      act(() => result.current.move('right')); // visual [0,1] ("o")
      expect(getBufferState(result).visualCursor).toEqual([0, 1]);
      act(() => result.current.move('right')); // visual [0,2] ("n")
      act(() => result.current.move('right')); // visual [0,3] ("g")
      act(() => result.current.move('right')); // visual [0,4] (" ")
      expect(getBufferState(result).visualCursor).toEqual([0, 4]);

      act(() => result.current.move('right')); // visual [1,0] ("l" of "line1")
      expect(getBufferState(result).visualCursor).toEqual([1, 0]);
      expect(getBufferState(result).cursor).toEqual([0, 5]); // logical cursor

      act(() => result.current.move('left')); // visual [0,4] (" " of "long ")
      expect(getBufferState(result).visualCursor).toEqual([0, 4]);
      expect(getBufferState(result).cursor).toEqual([0, 4]); // logical cursor
    });

    it('move: up/down should preserve preferred visual column', () => {
      const text = 'abcde\nxy\n12345';
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: text,
          viewport,
          isValidPath: () => false,
        }),
      );
      expect(result.current.allVisualLines).toEqual(['abcde', 'xy', '12345']);
      // Place cursor at the end of "abcde" -> logical [0,5]
      act(() => {
        result.current.move('home'); // to [0,0]
      });
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.move('right'); // to [0,5]
        });
      }
      expect(getBufferState(result).cursor).toEqual([0, 5]);
      expect(getBufferState(result).visualCursor).toEqual([0, 5]);

      // Set preferredCol by moving up then down to the same spot, then test.
      act(() => {
        result.current.move('down'); // to xy, logical [1,2], visual [1,2], preferredCol should be 5
      });
      let state = getBufferState(result);
      expect(state.cursor).toEqual([1, 2]); // Logical cursor at end of 'xy'
      expect(state.visualCursor).toEqual([1, 2]); // Visual cursor at end of 'xy'
      expect(state.preferredCol).toBe(5);

      act(() => result.current.move('down')); // to '12345', preferredCol=5.
      state = getBufferState(result);
      expect(state.cursor).toEqual([2, 5]); // Logical cursor at end of '12345'
      expect(state.visualCursor).toEqual([2, 5]); // Visual cursor at end of '12345'
      expect(state.preferredCol).toBe(5); // Preferred col is maintained

      act(() => result.current.move('left')); // preferredCol should reset
      state = getBufferState(result);
      expect(state.preferredCol).toBe(null);
    });

    it('move: home/end should go to visual line start/end', () => {
      const initialText = 'line one\nsecond line';
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText,
          viewport: { width: 5, height: 5 },
          isValidPath: () => false,
        }),
      );
      expect(result.current.allVisualLines).toEqual([
        'line',
        'one',
        'secon',
        'd',
        'line',
      ]);
      // Initial cursor [0,0] (start of "line")
      act(() => result.current.move('down')); // visual cursor from [0,0] to [1,0] ("o" of "one")
      act(() => result.current.move('right')); // visual cursor to [1,1] ("n" of "one")
      expect(getBufferState(result).visualCursor).toEqual([1, 1]);

      act(() => result.current.move('home')); // visual cursor to [1,0] (start of "one")
      expect(getBufferState(result).visualCursor).toEqual([1, 0]);

      act(() => result.current.move('end')); // visual cursor to [1,3] (end of "one")
      expect(getBufferState(result).visualCursor).toEqual([1, 3]); // "one" is 3 chars
    });
  });

  describe('Visual Layout & Viewport', () => {
    it('should wrap long lines correctly into visualLines', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'This is a very long line of text.', // 33 chars
          viewport: { width: 10, height: 5 },
          isValidPath: () => false,
        }),
      );
      const state = getBufferState(result);
      // Expected visual lines with word wrapping (viewport width 10):
      // "This is a"
      // "very long"
      // "line of"
      // "text."
      expect(state.allVisualLines.length).toBe(4);
      expect(state.allVisualLines[0]).toBe('This is a');
      expect(state.allVisualLines[1]).toBe('very long');
      expect(state.allVisualLines[2]).toBe('line of');
      expect(state.allVisualLines[3]).toBe('text.');
    });

    it('should update visualScrollRow when visualCursor moves out of viewport', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'l1\nl2\nl3\nl4\nl5',
          viewport: { width: 5, height: 3 }, // Can show 3 visual lines
          isValidPath: () => false,
        }),
      );
      // Initial: l1, l2, l3 visible. visualScrollRow = 0. visualCursor = [0,0]
      expect(getBufferState(result).visualScrollRow).toBe(0);
      expect(getBufferState(result).allVisualLines).toEqual([
        'l1',
        'l2',
        'l3',
        'l4',
        'l5',
      ]);
      expect(getBufferState(result).viewportVisualLines).toEqual([
        'l1',
        'l2',
        'l3',
      ]);

      act(() => result.current.move('down')); // vc=[1,0]
      act(() => result.current.move('down')); // vc=[2,0] (l3)
      expect(getBufferState(result).visualScrollRow).toBe(0);

      act(() => result.current.move('down')); // vc=[3,0] (l4) - scroll should happen
      // Now: l2, l3, l4 visible. visualScrollRow = 1.
      let state = getBufferState(result);
      expect(state.visualScrollRow).toBe(1);
      expect(state.allVisualLines).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
      expect(state.viewportVisualLines).toEqual(['l2', 'l3', 'l4']);
      expect(state.visualCursor).toEqual([3, 0]);

      act(() => result.current.move('up')); // vc=[2,0] (l3)
      act(() => result.current.move('up')); // vc=[1,0] (l2)
      expect(getBufferState(result).visualScrollRow).toBe(1);

      act(() => result.current.move('up')); // vc=[0,0] (l1) - scroll up
      // Now: l1, l2, l3 visible. visualScrollRow = 0
      state = getBufferState(result); // Assign to the existing `state` variable
      expect(state.visualScrollRow).toBe(0);
      expect(state.allVisualLines).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
      expect(state.viewportVisualLines).toEqual(['l1', 'l2', 'l3']);
      expect(state.visualCursor).toEqual([0, 0]);
    });
  });

  describe('Undo/Redo', () => {
    it('should undo and redo an insert operation', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() => result.current.insert('a'));
      expect(getBufferState(result).text).toBe('a');

      act(() => result.current.undo());
      expect(getBufferState(result).text).toBe('');
      expect(getBufferState(result).cursor).toEqual([0, 0]);

      act(() => result.current.redo());
      expect(getBufferState(result).text).toBe('a');
      expect(getBufferState(result).cursor).toEqual([0, 1]);
    });

    it('should undo and redo a newline operation', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'test',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end'));
      act(() => result.current.newline());
      expect(getBufferState(result).text).toBe('test\n');

      act(() => result.current.undo());
      expect(getBufferState(result).text).toBe('test');
      expect(getBufferState(result).cursor).toEqual([0, 4]);

      act(() => result.current.redo());
      expect(getBufferState(result).text).toBe('test\n');
      expect(getBufferState(result).cursor).toEqual([1, 0]);
    });
  });

  describe('Unicode Handling', () => {
    it('insert: should correctly handle multi-byte unicode characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() => result.current.insert('你好'));
      const state = getBufferState(result);
      expect(state.text).toBe('你好');
      expect(state.cursor).toEqual([0, 2]); // Cursor is 2 (char count)
      expect(state.visualCursor).toEqual([0, 2]);
    });

    it('backspace: should correctly delete multi-byte unicode characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '你好',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // cursor at [0,2]
      act(() => result.current.backspace()); // delete '好'
      let state = getBufferState(result);
      expect(state.text).toBe('你');
      expect(state.cursor).toEqual([0, 1]);

      act(() => result.current.backspace()); // delete '你'
      state = getBufferState(result);
      expect(state.text).toBe('');
      expect(state.cursor).toEqual([0, 0]);
    });

    it('move: left/right should treat multi-byte chars as single units for visual cursor', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '🐶🐱',
          viewport: { width: 5, height: 1 },
          isValidPath: () => false,
        }),
      );
      // Initial: visualCursor [0,0]
      act(() => result.current.move('right')); // visualCursor [0,1] (after 🐶)
      let state = getBufferState(result);
      expect(state.cursor).toEqual([0, 1]);
      expect(state.visualCursor).toEqual([0, 1]);

      act(() => result.current.move('right')); // visualCursor [0,2] (after 🐱)
      state = getBufferState(result);
      expect(state.cursor).toEqual([0, 2]);
      expect(state.visualCursor).toEqual([0, 2]);

      act(() => result.current.move('left')); // visualCursor [0,1] (before 🐱 / after 🐶)
      state = getBufferState(result);
      expect(state.cursor).toEqual([0, 1]);
      expect(state.visualCursor).toEqual([0, 1]);
    });
  });

  describe('handleInput', () => {
    it('should insert printable characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() =>
        result.current.handleInput({
          name: 'h',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'h',
        }),
      );
      act(() =>
        result.current.handleInput({
          name: 'i',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'i',
        }),
      );
      expect(getBufferState(result).text).toBe('hi');
    });

    it('should handle "Enter" key as newline', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() =>
        result.current.handleInput({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\r',
        }),
      );
      expect(getBufferState(result).lines).toEqual(['', '']);
    });

    it('should handle "Backspace" key', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'a',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end'));
      act(() =>
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x7f',
        }),
      );
      expect(getBufferState(result).text).toBe('');
    });

    it('should handle multiple delete characters in one input', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abcde',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // cursor at the end
      expect(getBufferState(result).cursor).toEqual([0, 5]);

      act(() => {
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x7f',
        });
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x7f',
        });
        result.current.handleInput({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x7f',
        });
      });
      expect(getBufferState(result).text).toBe('ab');
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('should handle inserts that contain delete characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abcde',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // cursor at the end
      expect(getBufferState(result).cursor).toEqual([0, 5]);

      act(() => {
        result.current.insert('\x7f\x7f\x7f');
      });
      expect(getBufferState(result).text).toBe('ab');
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('should handle inserts with a mix of regular and delete characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'abcde',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // cursor at the end
      expect(getBufferState(result).cursor).toEqual([0, 5]);

      act(() => {
        result.current.insert('\x7fI\x7f\x7fNEW');
      });
      expect(getBufferState(result).text).toBe('abcNEW');
      expect(getBufferState(result).cursor).toEqual([0, 6]);
    });

    it('should handle arrow keys for movement', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'ab',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.move('end')); // cursor [0,2]
      act(() =>
        result.current.handleInput({
          name: 'left',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x1b[D',
        }),
      ); // cursor [0,1]
      expect(getBufferState(result).cursor).toEqual([0, 1]);
      act(() =>
        result.current.handleInput({
          name: 'right',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\x1b[C',
        }),
      ); // cursor [0,2]
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('should strip ANSI escape codes when pasting text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithAnsi = '\x1B[31mHello\x1B[0m \x1B[32mWorld\x1B[0m';
      // Simulate pasting by calling handleInput with a string longer than 1 char
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithAnsi,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello World');
    });

    it('should handle VSCode terminal Shift+Enter as newline', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      act(() =>
        result.current.handleInput({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: true,
          paste: false,
          sequence: '\r',
        }),
      ); // Simulates Shift+Enter in VSCode terminal
      expect(getBufferState(result).lines).toEqual(['', '']);
    });

    it('should correctly handle repeated pasting of long text', () => {
      const longText = `not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.

Why do we use it?
It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using 'Content here, content here', making it look like readable English. Many desktop publishing packages and web page editors now use Lorem Ipsum as their default model text, and a search for 'lorem ipsum' will uncover many web sites still in their infancy. Various versions have evolved over the years, sometimes by accident, sometimes on purpose (injected humour and the like).

Where does it come from?
Contrary to popular belief, Lorem Ipsum is not simply random text. It has roots in a piece of classical Latin literature from 45 BC, making it over 2000 years old. Richard McClintock, a Latin professor at Hampden-Sydney College in Virginia, looked up one of the more obscure Latin words, consectetur, from a Lore
`;
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );

      // Simulate pasting the long text multiple times
      act(() => {
        result.current.insert(longText, { paste: true });
        result.current.insert(longText, { paste: true });
        result.current.insert(longText, { paste: true });
      });

      const state = getBufferState(result);
      // Check that the text is the result of three concatenations.
      expect(state.lines).toStrictEqual(
        (longText + longText + longText).split('\n'),
      );
      const expectedCursorPos = offsetToLogicalPos(
        state.text,
        state.text.length,
      );
      expect(state.cursor).toEqual(expectedCursorPos);
    });
  });

  // More tests would be needed for:
  // - setText, replaceRange
  // - deleteWordLeft, deleteWordRight
  // - More complex undo/redo scenarios
  // - Selection and clipboard (copy/paste) - might need clipboard API mocks or internal state check
  // - openInExternalEditor (heavy mocking of fs, child_process, os)
  // - All edge cases for visual scrolling and wrapping with different viewport sizes and text content.

  describe('replaceRange', () => {
    it('should replace a single-line range with single-line text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: '@pac',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 1, 0, 4, 'packages'));
      const state = getBufferState(result);
      expect(state.text).toBe('@packages');
      expect(state.cursor).toEqual([0, 9]); // cursor after 'typescript'
    });

    it('should replace a multi-line range with single-line text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello\nworld\nagain',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 2, 1, 3, ' new ')); // replace 'llo\nwor' with ' new '
      const state = getBufferState(result);
      expect(state.text).toBe('he new ld\nagain');
      expect(state.cursor).toEqual([0, 7]); // cursor after ' new '
    });

    it('should delete a range when replacing with an empty string', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello world',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 5, 0, 11, '')); // delete ' world'
      const state = getBufferState(result);
      expect(state.text).toBe('hello');
      expect(state.cursor).toEqual([0, 5]);
    });

    it('should handle replacing at the beginning of the text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'world',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 0, 0, 0, 'hello '));
      const state = getBufferState(result);
      expect(state.text).toBe('hello world');
      expect(state.cursor).toEqual([0, 6]);
    });

    it('should handle replacing at the end of the text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 5, 0, 5, ' world'));
      const state = getBufferState(result);
      expect(state.text).toBe('hello world');
      expect(state.cursor).toEqual([0, 11]);
    });

    it('should handle replacing the entire buffer content', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'old text',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 0, 0, 8, 'new text'));
      const state = getBufferState(result);
      expect(state.text).toBe('new text');
      expect(state.cursor).toEqual([0, 8]);
    });

    it('should correctly replace with unicode characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'hello *** world',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 6, 0, 9, '你好'));
      const state = getBufferState(result);
      expect(state.text).toBe('hello 你好 world');
      expect(state.cursor).toEqual([0, 8]); // after '你好'
    });

    it('should handle invalid range by returning false and not changing text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'test',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => {
        result.current.replaceRange(0, 5, 0, 3, 'fail'); // startCol > endCol in same line
      });

      expect(getBufferState(result).text).toBe('test');

      act(() => {
        result.current.replaceRange(1, 0, 0, 0, 'fail'); // startRow > endRow
      });
      expect(getBufferState(result).text).toBe('test');
    });

    it('replaceRange: multiple lines with a single character', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'first\nsecond\nthird',
          viewport,
          isValidPath: () => false,
        }),
      );
      act(() => result.current.replaceRange(0, 2, 2, 3, 'X')); // Replace 'rst\nsecond\nthi'
      const state = getBufferState(result);
      expect(state.text).toBe('fiXrd');
      expect(state.cursor).toEqual([0, 3]); // After 'X'
    });

    it('should replace a single-line range with multi-line text', () => {
      const { result } = renderHook(() =>
        useTextBuffer({
          initialText: 'one two three',
          viewport,
          isValidPath: () => false,
        }),
      );
      // Replace "two" with "new\nline"
      act(() => result.current.replaceRange(0, 4, 0, 7, 'new\nline'));
      const state = getBufferState(result);
      expect(state.lines).toEqual(['one new', 'line three']);
      expect(state.text).toBe('one new\nline three');
      expect(state.cursor).toEqual([1, 4]); // cursor after 'line'
    });
  });

  describe('Input Sanitization', () => {
    it('should strip ANSI escape codes from input', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithAnsi = '\x1B[31mHello\x1B[0m \x1B[32mWorld\x1B[0m';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithAnsi,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello World');
    });

    it('should strip control characters from input', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithControlChars = 'H\x07e\x08l\x0Bl\x0Co'; // BELL, BACKSPACE, VT, FF
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithControlChars,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello');
    });

    it('should strip mixed ANSI and control characters from input', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const textWithMixed = '\u001B[4mH\u001B[0mello';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: textWithMixed,
        }),
      );
      expect(getBufferState(result).text).toBe('Hello');
    });

    it('should not strip standard characters or newlines', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const validText = 'Hello World\nThis is a test.';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: validText,
        }),
      );
      expect(getBufferState(result).text).toBe(validText);
    });

    it('should sanitize pasted text via handleInput', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const pastedText = '\u001B[4mPasted\u001B[4m Text';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: pastedText,
        }),
      );
      expect(getBufferState(result).text).toBe('Pasted Text');
    });

    it('should sanitize large text (>5000 chars) and strip unsafe characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const unsafeChars = '\x07\x08\x0B\x0C';
      const largeTextWithUnsafe =
        'safe text'.repeat(600) + unsafeChars + 'more safe text';

      expect(largeTextWithUnsafe.length).toBeGreaterThan(5000);

      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: largeTextWithUnsafe,
        }),
      );

      const resultText = getBufferState(result).text;
      expect(resultText).not.toContain('\x07');
      expect(resultText).not.toContain('\x08');
      expect(resultText).not.toContain('\x0B');
      expect(resultText).not.toContain('\x0C');
      expect(resultText).toContain('safe text');
      expect(resultText).toContain('more safe text');
    });

    it('should sanitize large ANSI text (>5000 chars) and strip escape codes', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const largeTextWithAnsi =
        '\x1B[31m' +
        'red text'.repeat(800) +
        '\x1B[0m' +
        '\x1B[32m' +
        'green text'.repeat(200) +
        '\x1B[0m';

      expect(largeTextWithAnsi.length).toBeGreaterThan(5000);

      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: largeTextWithAnsi,
        }),
      );

      const resultText = getBufferState(result).text;
      expect(resultText).not.toContain('\x1B[31m');
      expect(resultText).not.toContain('\x1B[32m');
      expect(resultText).not.toContain('\x1B[0m');
      expect(resultText).toContain('red text');
      expect(resultText).toContain('green text');
    });

    it('should not strip popular emojis', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath: () => false }),
      );
      const emojis = '🐍🐳🦀🦄';
      act(() =>
        result.current.handleInput({
          name: '',
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: emojis,
        }),
      );
      expect(getBufferState(result).text).toBe(emojis);
    });
  });

  describe('stripAnsi', () => {
    it('should correctly strip ANSI escape codes', () => {
      const textWithAnsi = '\x1B[31mHello\x1B[0m World';
      expect(stripAnsi(textWithAnsi)).toBe('Hello World');
    });

    it('should handle multiple ANSI codes', () => {
      const textWithMultipleAnsi = '\x1B[1m\x1B[34mBold Blue\x1B[0m Text';
      expect(stripAnsi(textWithMultipleAnsi)).toBe('Bold Blue Text');
    });

    it('should not modify text without ANSI codes', () => {
      const plainText = 'Plain text';
      expect(stripAnsi(plainText)).toBe('Plain text');
    });

    it('should handle empty string', () => {
      expect(stripAnsi('')).toBe('');
    });
  });

  describe('Memoization', () => {
    it('should keep action references stable across re-renders', () => {
      // We pass a stable `isValidPath` so that callbacks that depend on it
      // are not recreated on every render.
      const isValidPath = () => false;
      const { result, rerender } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath }),
      );

      const initialInsert = result.current.insert;
      const initialBackspace = result.current.backspace;
      const initialMove = result.current.move;
      const initialHandleInput = result.current.handleInput;

      rerender();

      expect(result.current.insert).toBe(initialInsert);
      expect(result.current.backspace).toBe(initialBackspace);
      expect(result.current.move).toBe(initialMove);
      expect(result.current.handleInput).toBe(initialHandleInput);
    });

    it('should have memoized actions that operate on the latest state', () => {
      const isValidPath = () => false;
      const { result } = renderHook(() =>
        useTextBuffer({ viewport, isValidPath }),
      );

      // Store a reference to the memoized insert function.
      const memoizedInsert = result.current.insert;

      // Update the buffer state.
      act(() => {
        result.current.insert('hello');
      });
      expect(getBufferState(result).text).toBe('hello');

      // Now, call the original memoized function reference.
      act(() => {
        memoizedInsert(' world');
      });

      // It should have operated on the updated state.
      expect(getBufferState(result).text).toBe('hello world');
    });
  });
});

describe('offsetToLogicalPos', () => {
  it('should return [0,0] for offset 0', () => {
    expect(offsetToLogicalPos('any text', 0)).toEqual([0, 0]);
  });

  it('should handle single line text', () => {
    const text = 'hello';
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // Start
    expect(offsetToLogicalPos(text, 2)).toEqual([0, 2]); // Middle 'l'
    expect(offsetToLogicalPos(text, 5)).toEqual([0, 5]); // End
    expect(offsetToLogicalPos(text, 10)).toEqual([0, 5]); // Beyond end
  });

  it('should handle multi-line text', () => {
    const text = 'hello\nworld\n123';
    // "hello" (5) + \n (1) + "world" (5) + \n (1) + "123" (3)
    // h e l l o \n w o r l d \n 1 2 3
    // 0 1 2 3 4  5  6 7 8 9 0  1  2 3 4
    // Line 0: "hello" (length 5)
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // Start of 'hello'
    expect(offsetToLogicalPos(text, 3)).toEqual([0, 3]); // 'l' in 'hello'
    expect(offsetToLogicalPos(text, 5)).toEqual([0, 5]); // End of 'hello' (before \n)

    // Line 1: "world" (length 5)
    expect(offsetToLogicalPos(text, 6)).toEqual([1, 0]); // Start of 'world' (after \n)
    expect(offsetToLogicalPos(text, 8)).toEqual([1, 2]); // 'r' in 'world'
    expect(offsetToLogicalPos(text, 11)).toEqual([1, 5]); // End of 'world' (before \n)

    // Line 2: "123" (length 3)
    expect(offsetToLogicalPos(text, 12)).toEqual([2, 0]); // Start of '123' (after \n)
    expect(offsetToLogicalPos(text, 13)).toEqual([2, 1]); // '2' in '123'
    expect(offsetToLogicalPos(text, 15)).toEqual([2, 3]); // End of '123'
    expect(offsetToLogicalPos(text, 20)).toEqual([2, 3]); // Beyond end of text
  });

  it('should handle empty lines', () => {
    const text = 'a\n\nc'; // "a" (1) + \n (1) + "" (0) + \n (1) + "c" (1)
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // 'a'
    expect(offsetToLogicalPos(text, 1)).toEqual([0, 1]); // End of 'a'
    expect(offsetToLogicalPos(text, 2)).toEqual([1, 0]); // Start of empty line
    expect(offsetToLogicalPos(text, 3)).toEqual([2, 0]); // Start of 'c'
    expect(offsetToLogicalPos(text, 4)).toEqual([2, 1]); // End of 'c'
  });

  it('should handle text ending with a newline', () => {
    const text = 'hello\n'; // "hello" (5) + \n (1)
    expect(offsetToLogicalPos(text, 5)).toEqual([0, 5]); // End of 'hello'
    expect(offsetToLogicalPos(text, 6)).toEqual([1, 0]); // Position on the new empty line after

    expect(offsetToLogicalPos(text, 7)).toEqual([1, 0]); // Still on the new empty line
  });

  it('should handle text starting with a newline', () => {
    const text = '\nhello'; // "" (0) + \n (1) + "hello" (5)
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // Start of first empty line
    expect(offsetToLogicalPos(text, 1)).toEqual([1, 0]); // Start of 'hello'
    expect(offsetToLogicalPos(text, 3)).toEqual([1, 2]); // 'l' in 'hello'
  });

  it('should handle empty string input', () => {
    expect(offsetToLogicalPos('', 0)).toEqual([0, 0]);
    expect(offsetToLogicalPos('', 5)).toEqual([0, 0]);
  });

  it('should handle multi-byte unicode characters correctly', () => {
    const text = '你好\n世界'; // "你好" (2 chars) + \n (1) + "世界" (2 chars)
    // Total "code points" for offset calculation: 2 + 1 + 2 = 5
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]); // Start of '你好'
    expect(offsetToLogicalPos(text, 1)).toEqual([0, 1]); // After '你', before '好'
    expect(offsetToLogicalPos(text, 2)).toEqual([0, 2]); // End of '你好'
    expect(offsetToLogicalPos(text, 3)).toEqual([1, 0]); // Start of '世界'
    expect(offsetToLogicalPos(text, 4)).toEqual([1, 1]); // After '世', before '界'
    expect(offsetToLogicalPos(text, 5)).toEqual([1, 2]); // End of '世界'
    expect(offsetToLogicalPos(text, 6)).toEqual([1, 2]); // Beyond end
  });

  it('should handle offset exactly at newline character', () => {
    const text = 'abc\ndef';
    // a b c \n d e f
    // 0 1 2  3  4 5 6
    expect(offsetToLogicalPos(text, 3)).toEqual([0, 3]); // End of 'abc'
    // The next character is the newline, so an offset of 4 means the start of the next line.
    expect(offsetToLogicalPos(text, 4)).toEqual([1, 0]); // Start of 'def'
  });

  it('should handle offset in the middle of a multi-byte character (should place at start of that char)', () => {
    // This scenario is tricky as "offset" is usually character-based.
    // Assuming cpLen and related logic handles this by treating multi-byte as one unit.
    // The current implementation of offsetToLogicalPos uses cpLen, so it should be code-point aware.
    const text = '🐶🐱'; // 2 code points
    expect(offsetToLogicalPos(text, 0)).toEqual([0, 0]);
    expect(offsetToLogicalPos(text, 1)).toEqual([0, 1]); // After 🐶
    expect(offsetToLogicalPos(text, 2)).toEqual([0, 2]); // After 🐱
  });
});

describe('logicalPosToOffset', () => {
  it('should convert row/col position to offset correctly', () => {
    const lines = ['hello', 'world', '123'];

    // Line 0: "hello" (5 chars)
    expect(logicalPosToOffset(lines, 0, 0)).toBe(0); // Start of 'hello'
    expect(logicalPosToOffset(lines, 0, 3)).toBe(3); // 'l' in 'hello'
    expect(logicalPosToOffset(lines, 0, 5)).toBe(5); // End of 'hello'

    // Line 1: "world" (5 chars), offset starts at 6 (5 + 1 for newline)
    expect(logicalPosToOffset(lines, 1, 0)).toBe(6); // Start of 'world'
    expect(logicalPosToOffset(lines, 1, 2)).toBe(8); // 'r' in 'world'
    expect(logicalPosToOffset(lines, 1, 5)).toBe(11); // End of 'world'

    // Line 2: "123" (3 chars), offset starts at 12 (5 + 1 + 5 + 1)
    expect(logicalPosToOffset(lines, 2, 0)).toBe(12); // Start of '123'
    expect(logicalPosToOffset(lines, 2, 1)).toBe(13); // '2' in '123'
    expect(logicalPosToOffset(lines, 2, 3)).toBe(15); // End of '123'
  });

  it('should handle empty lines', () => {
    const lines = ['a', '', 'c'];

    expect(logicalPosToOffset(lines, 0, 0)).toBe(0); // 'a'
    expect(logicalPosToOffset(lines, 0, 1)).toBe(1); // End of 'a'
    expect(logicalPosToOffset(lines, 1, 0)).toBe(2); // Empty line
    expect(logicalPosToOffset(lines, 2, 0)).toBe(3); // 'c'
    expect(logicalPosToOffset(lines, 2, 1)).toBe(4); // End of 'c'
  });

  it('should handle single empty line', () => {
    const lines = [''];

    expect(logicalPosToOffset(lines, 0, 0)).toBe(0);
  });

  it('should be inverse of offsetToLogicalPos', () => {
    const lines = ['hello', 'world', '123'];
    const text = lines.join('\n');

    // Test round-trip conversion
    for (let offset = 0; offset <= text.length; offset++) {
      const [row, col] = offsetToLogicalPos(text, offset);
      const convertedOffset = logicalPosToOffset(lines, row, col);
      expect(convertedOffset).toBe(offset);
    }
  });

  it('should handle out-of-bounds positions', () => {
    const lines = ['hello'];

    // Beyond end of line
    expect(logicalPosToOffset(lines, 0, 10)).toBe(5); // Clamps to end of line

    // Beyond array bounds - should clamp to the last line
    expect(logicalPosToOffset(lines, 5, 0)).toBe(0); // Clamps to start of last line (row 0)
    expect(logicalPosToOffset(lines, 5, 10)).toBe(5); // Clamps to end of last line
  });
});

describe('textBufferReducer vim operations', () => {
  describe('vim_delete_line', () => {
    it('should delete a single line including newline in multi-line text', () => {
      const initialState: TextBufferState = {
        lines: ['line1', 'line2', 'line3'],
        cursorRow: 1,
        cursorCol: 2,
        preferredCol: null,
        visualLines: [['line1'], ['line2'], ['line3']],
        visualScrollRow: 0,
        visualCursor: { row: 1, col: 2 },
        viewport: { width: 10, height: 5 },
        undoStack: [],
        redoStack: [],
      };

      const action: TextBufferAction = {
        type: 'vim_delete_line',
        payload: { count: 1 },
      };

      const result = textBufferReducer(initialState, action);
      expect(result).toHaveOnlyValidCharacters();

      // After deleting line2, we should have line1 and line3, with cursor on line3 (now at index 1)
      expect(result.lines).toEqual(['line1', 'line3']);
      expect(result.cursorRow).toBe(1);
      expect(result.cursorCol).toBe(0);
    });

    it('should delete multiple lines when count > 1', () => {
      const initialState: TextBufferState = {
        lines: ['line1', 'line2', 'line3', 'line4'],
        cursorRow: 1,
        cursorCol: 0,
        preferredCol: null,
        visualLines: [['line1'], ['line2'], ['line3'], ['line4']],
        visualScrollRow: 0,
        visualCursor: { row: 1, col: 0 },
        viewport: { width: 10, height: 5 },
        undoStack: [],
        redoStack: [],
      };

      const action: TextBufferAction = {
        type: 'vim_delete_line',
        payload: { count: 2 },
      };

      const result = textBufferReducer(initialState, action);
      expect(result).toHaveOnlyValidCharacters();

      // Should delete line2 and line3, leaving line1 and line4
      expect(result.lines).toEqual(['line1', 'line4']);
      expect(result.cursorRow).toBe(1);
      expect(result.cursorCol).toBe(0);
    });

    it('should clear single line content when only one line exists', () => {
      const initialState: TextBufferState = {
        lines: ['only line'],
        cursorRow: 0,
        cursorCol: 5,
        preferredCol: null,
        visualLines: [['only line']],
        visualScrollRow: 0,
        visualCursor: { row: 0, col: 5 },
        viewport: { width: 10, height: 5 },
        undoStack: [],
        redoStack: [],
      };

      const action: TextBufferAction = {
        type: 'vim_delete_line',
        payload: { count: 1 },
      };

      const result = textBufferReducer(initialState, action);
      expect(result).toHaveOnlyValidCharacters();

      // Should clear the line content but keep the line
      expect(result.lines).toEqual(['']);
      expect(result.cursorRow).toBe(0);
      expect(result.cursorCol).toBe(0);
    });

    it('should handle deleting the last line properly', () => {
      const initialState: TextBufferState = {
        lines: ['line1', 'line2'],
        cursorRow: 1,
        cursorCol: 0,
        preferredCol: null,
        visualLines: [['line1'], ['line2']],
        visualScrollRow: 0,
        visualCursor: { row: 1, col: 0 },
        viewport: { width: 10, height: 5 },
        undoStack: [],
        redoStack: [],
      };

      const action: TextBufferAction = {
        type: 'vim_delete_line',
        payload: { count: 1 },
      };

      const result = textBufferReducer(initialState, action);
      expect(result).toHaveOnlyValidCharacters();

      // Should delete the last line completely, not leave empty line
      expect(result.lines).toEqual(['line1']);
      expect(result.cursorRow).toBe(0);
      expect(result.cursorCol).toBe(0);
    });

    it('should handle deleting all lines and maintain valid state for subsequent paste', () => {
      const initialState: TextBufferState = {
        lines: ['line1', 'line2', 'line3', 'line4'],
        cursorRow: 0,
        cursorCol: 0,
        preferredCol: null,
        visualLines: [['line1'], ['line2'], ['line3'], ['line4']],
        visualScrollRow: 0,
        visualCursor: { row: 0, col: 0 },
        viewport: { width: 10, height: 5 },
        undoStack: [],
        redoStack: [],
      };

      // Delete all 4 lines with 4dd
      const deleteAction: TextBufferAction = {
        type: 'vim_delete_line',
        payload: { count: 4 },
      };

      const afterDelete = textBufferReducer(initialState, deleteAction);
      expect(afterDelete).toHaveOnlyValidCharacters();

      // After deleting all lines, should have one empty line
      expect(afterDelete.lines).toEqual(['']);
      expect(afterDelete.cursorRow).toBe(0);
      expect(afterDelete.cursorCol).toBe(0);

      // Now paste multiline content - this should work correctly
      const pasteAction: TextBufferAction = {
        type: 'insert',
        payload: 'new1\nnew2\nnew3\nnew4',
      };

      const afterPaste = textBufferReducer(afterDelete, pasteAction);
      expect(afterPaste).toHaveOnlyValidCharacters();

      // All lines including the first one should be present
      expect(afterPaste.lines).toEqual(['new1', 'new2', 'new3', 'new4']);
      expect(afterPaste.cursorRow).toBe(3);
      expect(afterPaste.cursorCol).toBe(4);
    });
  });
});

describe('Unicode helper functions', () => {
  describe('findWordEndInLine with Unicode', () => {
    it('should handle combining characters', () => {
      // café with combining accent
      const cafeWithCombining = 'cafe\u0301';
      const result = findWordEndInLine(cafeWithCombining + ' test', 0);
      expect(result).toBe(3); // End of 'café' at base character 'e', not combining accent
    });

    it('should handle precomposed characters with diacritics', () => {
      // café with precomposed é (U+00E9)
      const cafePrecomposed = 'café';
      const result = findWordEndInLine(cafePrecomposed + ' test', 0);
      expect(result).toBe(3); // End of 'café' at precomposed character 'é'
    });

    it('should return null when no word end found', () => {
      const result = findWordEndInLine('   ', 0);
      expect(result).toBeNull(); // No word end found in whitespace-only string string
    });
  });

  describe('findNextWordStartInLine with Unicode', () => {
    it('should handle right-to-left text', () => {
      const result = findNextWordStartInLine('hello مرحبا world', 0);
      expect(result).toBe(6); // Start of Arabic word
    });

    it('should handle Chinese characters', () => {
      const result = findNextWordStartInLine('hello 你好 world', 0);
      expect(result).toBe(6); // Start of Chinese word
    });

    it('should return null at end of line', () => {
      const result = findNextWordStartInLine('hello', 10);
      expect(result).toBeNull();
    });

    it('should handle combining characters', () => {
      // café with combining accent + next word
      const textWithCombining = 'cafe\u0301 test';
      const result = findNextWordStartInLine(textWithCombining, 0);
      expect(result).toBe(6); // Start of 'test' after 'café ' (combining char makes string longer)
    });

    it('should handle precomposed characters with diacritics', () => {
      // café with precomposed é + next word
      const textPrecomposed = 'café test';
      const result = findNextWordStartInLine(textPrecomposed, 0);
      expect(result).toBe(5); // Start of 'test' after 'café '
    });
  });

  describe('isWordCharStrict with Unicode', () => {
    it('should return true for ASCII word characters', () => {
      expect(isWordCharStrict('a')).toBe(true);
      expect(isWordCharStrict('Z')).toBe(true);
      expect(isWordCharStrict('0')).toBe(true);
      expect(isWordCharStrict('_')).toBe(true);
    });

    it('should return false for punctuation', () => {
      expect(isWordCharStrict('.')).toBe(false);
      expect(isWordCharStrict(',')).toBe(false);
      expect(isWordCharStrict('!')).toBe(false);
    });

    it('should return true for non-Latin scripts', () => {
      expect(isWordCharStrict('你')).toBe(true); // Chinese character
      expect(isWordCharStrict('م')).toBe(true); // Arabic character
    });

    it('should return false for whitespace', () => {
      expect(isWordCharStrict(' ')).toBe(false);
      expect(isWordCharStrict('\t')).toBe(false);
    });
  });

  describe('cpLen with Unicode', () => {
    it('should handle combining characters', () => {
      expect(cpLen('é')).toBe(1); // Precomposed
      expect(cpLen('e\u0301')).toBe(2); // e + combining acute
    });

    it('should handle Chinese and Arabic text', () => {
      expect(cpLen('hello 你好 world')).toBe(14); // 5 + 1 + 2 + 1 + 5 = 14
      expect(cpLen('hello مرحبا world')).toBe(17);
    });
  });
});
