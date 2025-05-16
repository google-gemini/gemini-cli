/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTextBuffer, Viewport, TextBuffer } from './text-buffer.js';

// Helper to get the state from the hook
const getBufferState = (result: { current: TextBuffer }) => ({
  text: result.current.text,
  lines: [...result.current.lines], // Clone for safety
  cursor: [...result.current.cursor] as [number, number],
  allVisualLines: [...result.current.allVisualLines],
  viewportVisualLines: [...result.current.viewportVisualLines],
  visualCursor: [...result.current.visualCursor] as [number, number],
  visualScrollRow: result.current.visualScrollRow,
  preferredCol: result.current.preferredCol,
});

describe('useTextBuffer', () => {
  let viewport: Viewport;

  beforeEach(() => {
    viewport = { width: 10, height: 3 }; // Default viewport for tests
  });

  describe('Initialization', () => {
    it('should initialize with empty text and cursor at (0,0) by default', () => {
      const { result } = renderHook(() => useTextBuffer({ viewport }));
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
        useTextBuffer({ initialText: 'hello', viewport }),
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
      const { result } = renderHook(() => useTextBuffer({ viewport }));
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

    it('newline: should create a new line and move cursor', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ initialText: 'ab', viewport }),
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
        useTextBuffer({ initialText: 'a\nb', viewport }),
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
        useTextBuffer({ initialText: 'a\nb', viewport }),
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
        useTextBuffer({ initialText: text, viewport }),
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
        useTextBuffer({ initialText, viewport: { width: 5, height: 5 } }),
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
      const { result } = renderHook(() => useTextBuffer({ viewport }));
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
        useTextBuffer({ initialText: 'test', viewport }),
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
      const { result } = renderHook(() => useTextBuffer({ viewport }));
      act(() => result.current.insert('你好'));
      const state = getBufferState(result);
      expect(state.text).toBe('你好');
      expect(state.cursor).toEqual([0, 2]); // Cursor is 2 (char count)
      expect(state.visualCursor).toEqual([0, 2]);
    });

    it('backspace: should correctly delete multi-byte unicode characters', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ initialText: '你好', viewport }),
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
      const { result } = renderHook(() => useTextBuffer({ viewport }));
      act(() => result.current.handleInput('h', {}));
      act(() => result.current.handleInput('i', {}));
      expect(getBufferState(result).text).toBe('hi');
    });

    it('should handle "Enter" key as newline', () => {
      const { result } = renderHook(() => useTextBuffer({ viewport }));
      act(() => result.current.handleInput(undefined, { return: true }));
      expect(getBufferState(result).lines).toEqual(['', '']);
    });

    it('should handle "Backspace" key', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ initialText: 'a', viewport }),
      );
      act(() => result.current.move('end'));
      act(() => result.current.handleInput(undefined, { backspace: true }));
      expect(getBufferState(result).text).toBe('');
    });

    it('should handle arrow keys for movement', () => {
      const { result } = renderHook(() =>
        useTextBuffer({ initialText: 'ab', viewport }),
      );
      act(() => result.current.move('end')); // cursor [0,2]
      act(() => result.current.handleInput(undefined, { leftArrow: true })); // cursor [0,1]
      expect(getBufferState(result).cursor).toEqual([0, 1]);
      act(() => result.current.handleInput(undefined, { rightArrow: true })); // cursor [0,2]
      expect(getBufferState(result).cursor).toEqual([0, 2]);
    });

    it('should strip ANSI escape codes when pasting text', () => {
      const { result } = renderHook(() => useTextBuffer({ viewport }));
      const textWithAnsi = '\x1B[31mHello\x1B[0m \x1B[32mWorld\x1B[0m';
      // Simulate pasting by calling handleInput with a string longer than 1 char
      act(() => result.current.handleInput(textWithAnsi, {}));
      expect(getBufferState(result).text).toBe('Hello World');
    });
  });

  // More tests would be needed for:
  // - setText, replaceRange
  // - deleteWordLeft, deleteWordRight
  // - More complex undo/redo scenarios
  // - Selection and clipboard (copy/paste) - might need clipboard API mocks or internal state check
  // - openInExternalEditor (heavy mocking of fs, child_process, os)
  // - All edge cases for visual scrolling and wrapping with different viewport sizes and text content.
});
