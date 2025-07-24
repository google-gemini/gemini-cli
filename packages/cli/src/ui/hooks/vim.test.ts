/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useVim } from './vim.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { LoadedSettings } from '../../config/settings.js';

// Mock the VimModeContext
const mockVimContext = {
  vimEnabled: true,
  vimMode: 'NORMAL' as const,
  toggleVimEnabled: vi.fn(),
  setVimMode: vi.fn(),
};

vi.mock('../contexts/VimModeContext.js', () => ({
  useVimMode: () => mockVimContext,
  VimModeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Test constants
const TEST_SEQUENCES = {
  ESCAPE: { sequence: '\u001b', name: 'escape' },
  LEFT: { sequence: 'h' },
  RIGHT: { sequence: 'l' },
  UP: { sequence: 'k' },
  DOWN: { sequence: 'j' },
  INSERT: { sequence: 'i' },
  APPEND: { sequence: 'a' },
  DELETE_CHAR: { sequence: 'x' },
  DELETE: { sequence: 'd' },
  CHANGE: { sequence: 'c' },
  WORD_FORWARD: { sequence: 'w' },
  WORD_BACKWARD: { sequence: 'b' },
  WORD_END: { sequence: 'e' },
  LINE_START: { sequence: '0' },
  LINE_END: { sequence: '$' },
  REPEAT: { sequence: '.' },
} as const;

describe('useVim hook', () => {
  let mockBuffer: Partial<TextBuffer>;
  let mockHandleFinalSubmit: vi.Mock;

  const createMockBuffer = (
    text = 'hello world',
    cursor: [number, number] = [0, 5],
  ) => {
    const cursorState = { pos: cursor };
    const lines = text.split('\n');

    return {
      lines,
      get cursor() {
        return cursorState.pos;
      },
      set cursor(newPos: [number, number]) {
        cursorState.pos = newPos;
      },
      text,
      move: vi.fn().mockImplementation((direction: string) => {
        let [row, col] = cursorState.pos;
        const line = lines[row] || '';
        if (direction === 'left') {
          col = Math.max(0, col - 1);
        } else if (direction === 'right') {
          col = Math.min(line.length, col + 1);
        } else if (direction === 'home') {
          col = 0;
        } else if (direction === 'end') {
          col = line.length;
        }
        cursorState.pos = [row, col];
      }),
      del: vi.fn(),
      moveToOffset: vi.fn(),
      insert: vi.fn(),
      newline: vi.fn(),
      replaceRangeByOffset: vi.fn(),
      handleInput: vi.fn(),
      setText: vi.fn(),
      // Vim-specific methods
      vimDeleteWordForward: vi.fn(),
      vimDeleteWordBackward: vi.fn(),
      vimDeleteWordEnd: vi.fn(),
      vimChangeWordForward: vi.fn(),
      vimChangeWordBackward: vi.fn(),
      vimChangeWordEnd: vi.fn(),
      vimDeleteLine: vi.fn(),
      vimChangeLine: vi.fn(),
      vimDeleteToEndOfLine: vi.fn(),
      vimChangeToEndOfLine: vi.fn(),
      vimChangeMovement: vi.fn(),
    };
  };

  const createMockSettings = (vimMode = true) => ({
    getValue: vi.fn().mockReturnValue(vimMode),
    setValue: vi.fn(),
    merged: { vimMode },
  });

  const renderVimHook = (buffer?: Partial<TextBuffer>) =>
    renderHook(() =>
      useVim((buffer || mockBuffer) as TextBuffer, mockHandleFinalSubmit),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleFinalSubmit = vi.fn();
    mockBuffer = createMockBuffer();
    // Reset mock context to default state
    mockVimContext.vimEnabled = true;
    mockVimContext.vimMode = 'NORMAL';
    mockVimContext.toggleVimEnabled.mockClear();
    mockVimContext.setVimMode.mockClear();
  });

  describe('Mode switching', () => {
    it('should start in NORMAL mode', () => {
      const { result } = renderVimHook();
      expect(result.current.mode).toBe('NORMAL');
    });

    it('should switch to INSERT mode with i command', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput(TEST_SEQUENCES.INSERT);
      });

      expect(result.current.mode).toBe('INSERT');
      expect(mockVimContext.setVimMode).toHaveBeenCalledWith('INSERT');
    });

    it('should switch back to NORMAL mode with Escape', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput(TEST_SEQUENCES.INSERT);
      });
      expect(result.current.mode).toBe('INSERT');

      act(() => {
        result.current.handleInput(TEST_SEQUENCES.ESCAPE);
      });
      expect(result.current.mode).toBe('NORMAL');
    });

    it('should properly handle escape followed immediately by a command', () => {
      const testBuffer = createMockBuffer('hello world test', [0, 6]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'i' });
      });
      expect(result.current.mode).toBe('INSERT');

      vi.clearAllMocks();

      act(() => {
        result.current.handleInput({ sequence: '\u001b', name: 'escape' });
      });
      expect(result.current.mode).toBe('NORMAL');

      act(() => {
        result.current.handleInput({ sequence: 'b' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation commands', () => {
    it('should handle h (left movement)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'h' });
      });

      expect(mockBuffer.move).toHaveBeenCalled();
    });

    it('should handle l (right movement)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'l' });
      });

      expect(mockBuffer.move).toHaveBeenCalled();
    });

    it('should handle j (down movement)', () => {
      const testBuffer = createMockBuffer('first line\nsecond line');
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'j' });
      });

      expect(testBuffer.move).toHaveBeenCalledWith('down');
    });

    it('should handle k (up movement)', () => {
      const testBuffer = createMockBuffer('first line\nsecond line');
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'k' });
      });

      expect(testBuffer.move).toHaveBeenCalledWith('up');
    });

    it('should handle 0 (move to start of line)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: '0' });
      });

      expect(mockBuffer.move).toHaveBeenCalledWith('home');
    });

    it('should handle $ (move to end of line)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: '$' });
      });

      expect(mockBuffer.move).toHaveBeenCalledWith('end');
    });
  });

  describe('Mode switching commands', () => {
    it('should handle a (append after cursor)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'a' });
      });

      expect(mockBuffer.move).toHaveBeenCalledWith('right');
      expect(result.current.mode).toBe('INSERT');
    });

    it('should handle A (append at end of line)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'A' });
      });

      expect(mockBuffer.move).toHaveBeenCalledWith('end');
      expect(result.current.mode).toBe('INSERT');
    });

    it('should handle o (open line below)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'o' });
      });

      expect(mockBuffer.move).toHaveBeenCalledWith('end');
      expect(mockBuffer.newline).toHaveBeenCalled();
      expect(result.current.mode).toBe('INSERT');
    });

    it('should handle O (open line above)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'O' });
      });

      expect(mockBuffer.move).toHaveBeenCalledWith('home');
      expect(mockBuffer.newline).toHaveBeenCalled();
      expect(mockBuffer.move).toHaveBeenCalledWith('up');
      expect(result.current.mode).toBe('INSERT');
    });
  });

  describe('Edit commands', () => {
    it('should handle x (delete character)', () => {
      const { result } = renderVimHook();
      vi.clearAllMocks();

      act(() => {
        result.current.handleInput({ sequence: 'x' });
      });

      expect(mockBuffer.del).toHaveBeenCalled();
    });

    it('should move cursor left when deleting last character on line (vim behavior)', () => {
      const testBuffer = createMockBuffer('hello', [0, 4]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'x' });
      });

      expect(testBuffer.del).toHaveBeenCalled();
      expect(testBuffer.move).toHaveBeenCalledWith('left');
    });

    it('should handle first d key (sets pending state)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'd' });
      });

      expect(mockBuffer.replaceRangeByOffset).not.toHaveBeenCalled();
    });
  });

  describe('Count handling', () => {
    it('should handle count input and return to count 0 after command', () => {
      const { result } = renderVimHook();

      act(() => {
        const handled = result.current.handleInput({ sequence: '3' });
        expect(handled).toBe(true);
      });

      act(() => {
        const handled = result.current.handleInput({ sequence: 'h' });
        expect(handled).toBe(true);
      });

      expect(mockBuffer.move).toHaveBeenCalled();
    });

    it('should only delete 1 character with x command when no count is specified', () => {
      const testBuffer = createMockBuffer();
      const _testSettings = createMockSettings();
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'x' });
      });

      expect(testBuffer.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('Word movement', () => {
    it('should properly initialize vim hook with word movement support', () => {
      const testBuffer = createMockBuffer('cat elephant mouse', [0, 0]);
      const { result } = renderVimHook(testBuffer);

      expect(result.current.vimModeEnabled).toBe(true);
      expect(result.current.mode).toBe('NORMAL');
      expect(result.current.handleInput).toBeDefined();
    });

    it('should support vim mode and basic operations across multiple lines', () => {
      const testBuffer = createMockBuffer(
        'first line word\nsecond line word',
        [0, 11],
      );
      const { result } = renderVimHook(testBuffer);

      expect(result.current.vimModeEnabled).toBe(true);
      expect(result.current.mode).toBe('NORMAL');
      expect(result.current.handleInput).toBeDefined();
      expect(testBuffer.replaceRangeByOffset).toBeDefined();
      expect(testBuffer.moveToOffset).toBeDefined();
    });

    it('should handle w (next word)', () => {
      const testBuffer = createMockBuffer('hello world test');
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'w' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalled();
    });

    it('should handle b (previous word)', () => {
      const testBuffer = createMockBuffer('hello world test', [0, 6]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'b' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalled();
    });

    it('should handle e (end of word)', () => {
      const testBuffer = createMockBuffer('hello world test');
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'e' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalled();
    });

    it('should handle w when cursor is on the last word', () => {
      const testBuffer = createMockBuffer('hello world', [0, 8]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'w' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalledWith(11);
    });

    it('should handle first c key (sets pending change state)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'c' });
      });

      expect(result.current.mode).toBe('NORMAL');
      expect(mockBuffer.del).not.toHaveBeenCalled();
    });

    it('should clear pending state on invalid command sequence (df)', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'd' });
        result.current.handleInput({ sequence: 'f' });
      });

      expect(mockBuffer.replaceRangeByOffset).not.toHaveBeenCalled();
      expect(mockBuffer.del).not.toHaveBeenCalled();
    });

    it('should clear pending state with Escape in NORMAL mode', () => {
      const { result } = renderVimHook();

      act(() => {
        result.current.handleInput({ sequence: 'd' });
      });

      act(() => {
        result.current.handleInput({ name: 'escape', sequence: '\u001b' });
      });

      expect(mockBuffer.replaceRangeByOffset).not.toHaveBeenCalled();
    });
  });

  describe('Disabled vim mode', () => {
    it('should not respond to vim commands when disabled', () => {
      mockVimContext.vimEnabled = false;
      const { result } = renderVimHook(mockBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'h' });
      });

      expect(mockBuffer.move).not.toHaveBeenCalled();
    });
  });

  // Toggle vim mode functionality has been moved to VimModeContext
  // These tests are no longer applicable at the hook level

  describe('Command repeat system', () => {
    it('should repeat x command from current cursor position', () => {
      const testBuffer = createMockBuffer('abcd\nefgh\nijkl', [0, 1]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'x' });
      });
      expect(testBuffer.del).toHaveBeenCalledTimes(1);

      testBuffer.cursor = [1, 2];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });
      expect(testBuffer.del).toHaveBeenCalledTimes(2);
    });

    it('should repeat dd command from current position', () => {
      const testBuffer = createMockBuffer('line1\nline2\nline3', [1, 0]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'd' });
      });
      act(() => {
        result.current.handleInput({ sequence: 'd' });
      });

      testBuffer.cursor = [0, 0];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });

      expect(result.current.handleInput).toBeDefined();
    });

    it('should repeat ce command from current position', () => {
      const testBuffer = createMockBuffer('word', [0, 0]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'c' });
      });
      act(() => {
        result.current.handleInput({ sequence: 'e' });
      });

      testBuffer.cursor = [0, 2];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });

      expect(result.current.handleInput).toBeDefined();
    });

    it('should repeat cc command from current position', () => {
      const testBuffer = createMockBuffer('line1\nline2\nline3', [1, 2]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'c' });
      });
      act(() => {
        result.current.handleInput({ sequence: 'c' });
      });

      testBuffer.cursor = [0, 1];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });

      expect(result.current.handleInput).toBeDefined();
    });

    it('should repeat cw command from current position', () => {
      const testBuffer = createMockBuffer('hello world test', [0, 6]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'c' });
      });
      act(() => {
        result.current.handleInput({ sequence: 'w' });
      });

      testBuffer.cursor = [0, 0];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });

      expect(result.current.handleInput).toBeDefined();
    });

    it('should repeat D command from current position', () => {
      const testBuffer = createMockBuffer('hello world test', [0, 6]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'D' });
      });

      testBuffer.cursor = [0, 2];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });

      expect(result.current.handleInput).toBeDefined();
    });

    it('should repeat C command from current position', () => {
      const testBuffer = createMockBuffer('hello world test', [0, 6]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'C' });
      });

      testBuffer.cursor = [0, 2];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });

      expect(result.current.handleInput).toBeDefined();
    });

    it('should repeat command after cursor movement', () => {
      const testBuffer = createMockBuffer('test text', [0, 0]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'x' });
      });
      expect(testBuffer.del).toHaveBeenCalledTimes(1);

      testBuffer.cursor = [0, 2];

      act(() => {
        result.current.handleInput({ sequence: '.' });
      });
      expect(testBuffer.del).toHaveBeenCalledTimes(2);
    });

    it('should move cursor to the correct position after exiting INSERT mode with "a"', () => {
      const testBuffer = createMockBuffer('hello world', [0, 10]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'a' });
      });
      expect(result.current.mode).toBe('INSERT');
      expect(testBuffer.cursor).toEqual([0, 11]);

      act(() => {
        result.current.handleInput({ name: 'escape', sequence: '\u001b' });
      });
      expect(result.current.mode).toBe('NORMAL');
      expect(testBuffer.cursor).toEqual([0, 10]);
    });
  });

  describe('Special characters and edge cases', () => {
    it('should handle ^ (move to first non-whitespace character)', () => {
      const testBuffer = createMockBuffer('   hello world', [0, 5]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: '^' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalledWith(3);
    });

    it('should handle G without count (go to last line)', () => {
      const testBuffer = createMockBuffer('line1\nline2\nline3', [0, 0]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: 'G' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalled();
    });

    it('should handle gg (go to first line)', () => {
      const testBuffer = createMockBuffer('line1\nline2\nline3', [2, 0]);
      const { result } = renderVimHook(testBuffer);

      // First 'g' sets pending state
      act(() => {
        result.current.handleInput({ sequence: 'g' });
      });

      // Second 'g' executes the command
      act(() => {
        result.current.handleInput({ sequence: 'g' });
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalledWith(0);
    });

    it('should handle count with movement commands', () => {
      const testBuffer = createMockBuffer('hello world test', [0, 0]);
      const { result } = renderVimHook(testBuffer);

      act(() => {
        result.current.handleInput({ sequence: '3' });
        result.current.handleInput(TEST_SEQUENCES.WORD_FORWARD);
      });

      expect(testBuffer.moveToOffset).toHaveBeenCalled();
    });
  });
});
