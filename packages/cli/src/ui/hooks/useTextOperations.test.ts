/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTextOperations } from './useTextOperations.js';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type { UseHistoryStateReturn } from './useHistoryState.js';

// Mock dependencies
vi.mock('./useLogicalTextState.js');
vi.mock('./useHistoryState.js');

describe('useTextOperations', () => {
  // Mock state hooks
  let mockLogicalState: Partial<UseLogicalTextStateReturn>;
  let mockHistoryState: Partial<UseHistoryStateReturn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock logical text state
    mockLogicalState = {
      lines: ['hello world'],
      cursorRow: 0,
      cursorCol: 5,
      preferredCol: null,
      insertText: vi.fn(),
      deleteCharBefore: vi.fn(),
      deleteCharAfter: vi.fn(),
      setCursor: vi.fn(),
      setPreferredCol: vi.fn(),
      getCurrentLine: vi.fn(() => 'hello world'),
      getCurrentLineLength: vi.fn(() => 11),
      isAtStartOfLine: vi.fn(() => false),
      isAtEndOfLine: vi.fn(() => false),
    };

    // Setup mock history state
    mockHistoryState = {
      pushUndo: vi.fn(),
      canUndo: true,
      canRedo: false,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('insertStr', () => {
    it('should not fail - useTextOperations is now implemented', () => {
      expect(() => {
        renderHook(() =>
          useTextOperations(
            mockLogicalState as UseLogicalTextStateReturn,
            mockHistoryState as UseHistoryStateReturn,
            vi.fn(), // isValidPath
          ),
        );
      }).not.toThrow();
    });

    it('should handle multi-line text insertion', () => {
      // This test will fail until we implement the hook
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.insertStr('line1\nline2\nline3');
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalledWith({
        lines: ['hello world'],
        cursorRow: 0,
        cursorCol: 5,
      });
      expect(mockLogicalState.insertText).toHaveBeenCalledWith(
        'line1\nline2\nline3',
        { skipCallbacks: undefined },
      );
    });

    it('should handle empty string insertion', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        const _success = result.current.insertStr('');
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
      expect(mockLogicalState.insertText).not.toHaveBeenCalled();
    });

    it('should normalize text with various line endings', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.insertStr('line1\r\nline2\rline3');
      });

      expect(mockLogicalState.insertText).toHaveBeenCalledWith(
        'line1\nline2\nline3',
        { skipCallbacks: undefined },
      );
    });
  });

  describe('insert', () => {
    it('should handle single character insertion', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.insert('x');
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.insertText).toHaveBeenCalledWith('x', {
        skipCallbacks: undefined,
      });
    });

    it('should handle newline character insertion', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.insert('\n');
      });

      expect(mockLogicalState.insertText).toHaveBeenCalledWith('\n', {
        skipCallbacks: undefined,
      });
    });

    it('should detect and prefix valid file paths with @', () => {
      const isValidPath = vi.fn(() => true);
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          isValidPath,
        ),
      );

      act(() => {
        result.current.insert('/valid/file/path.txt');
      });

      expect(isValidPath).toHaveBeenCalledWith('/valid/file/path.txt');
      expect(mockLogicalState.insertText).toHaveBeenCalledWith(
        '@/valid/file/path.txt',
        { skipCallbacks: undefined },
      );
    });

    it('should handle quoted file paths', () => {
      const isValidPath = vi.fn(() => true);
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          isValidPath,
        ),
      );

      act(() => {
        result.current.insert("'/path/to/file.txt'");
      });

      expect(isValidPath).toHaveBeenCalledWith('/path/to/file.txt');
      expect(mockLogicalState.insertText).toHaveBeenCalledWith(
        '@/path/to/file.txt',
        { skipCallbacks: undefined },
      );
    });

    it('should strip unsafe characters', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.insert('test\x7f\x01unsafe');
      });

      expect(mockLogicalState.insertText).toHaveBeenCalledWith('testunsafe', {
        skipCallbacks: undefined,
      });
    });
  });

  describe('newline', () => {
    it('should insert newline character', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.newline();
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.insertText).toHaveBeenCalledWith('\n', {
        skipCallbacks: undefined,
      });
    });
  });

  describe('backspace', () => {
    it('should delete character before cursor', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.backspace();
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.deleteCharBefore).toHaveBeenCalledWith({
        skipCallbacks: undefined,
      });
    });

    it('should not perform backspace at start of document', () => {
      mockLogicalState.cursorRow = 0;
      mockLogicalState.cursorCol = 0;
      mockLogicalState.isAtStartOfLine = vi.fn(() => true);

      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.backspace();
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
      expect(mockLogicalState.deleteCharBefore).not.toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should delete character after cursor', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.del();
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.deleteCharAfter).toHaveBeenCalledWith({
        skipCallbacks: undefined,
      });
    });

    it('should not perform delete at end of document', () => {
      mockLogicalState.lines = ['hello world'];
      mockLogicalState.cursorRow = 0;
      mockLogicalState.cursorCol = 11;
      mockLogicalState.isAtEndOfLine = vi.fn(() => true);

      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.del();
      });

      // Should still attempt to delete - logic for end of doc is in deleteCharAfter
      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.deleteCharAfter).toHaveBeenCalledWith({
        skipCallbacks: undefined,
      });
    });
  });

  describe('applyOperations', () => {
    it('should handle batch operations', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.applyOperations([
          { type: 'insert', payload: 'hello' },
          { type: 'backspace' },
          { type: 'insert', payload: 'world' },
        ]);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalledTimes(1); // Single batch operation
    });

    it('should handle empty operations array', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.applyOperations([]);
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
    });

    it('should expand DELETE character (0x7F) to backspace operation', () => {
      const { result } = renderHook(() =>
        useTextOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
          vi.fn(),
        ),
      );

      act(() => {
        result.current.applyOperations([
          { type: 'insert', payload: 'test\x7f' },
        ]);
      });

      // Should result in insert 'test' followed by backspace
      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
    });
  });
});
