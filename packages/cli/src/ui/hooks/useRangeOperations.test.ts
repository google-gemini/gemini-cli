/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRangeOperations } from './useRangeOperations.js';
import type { UseLogicalTextStateReturn } from './useLogicalTextState.js';
import type { UseHistoryStateReturn } from './useHistoryState.js';

// Mock dependencies
vi.mock('./useLogicalTextState.js');
vi.mock('./useHistoryState.js');
vi.mock('../../utils/text-buffer-utils.js', () => ({
  offsetToLogicalPos: vi.fn((text: string, offset: number) => {
    // Simple mock implementation
    let currentOffset = 0;
    const lines = text.split('\n');
    for (let row = 0; row < lines.length; row++) {
      const lineLen = lines[row].length;
      if (currentOffset + lineLen >= offset) {
        return [row, offset - currentOffset];
      }
      currentOffset += lineLen + 1; // +1 for newline
    }
    return [lines.length - 1, lines[lines.length - 1]?.length || 0];
  }),
  clamp: vi.fn((v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v)),
  ),
}));

describe('useRangeOperations', () => {
  // Mock state hooks
  let mockLogicalState: Partial<UseLogicalTextStateReturn>;
  let mockHistoryState: Partial<UseHistoryStateReturn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock logical text state
    mockLogicalState = {
      lines: ['hello world', 'second line', 'third line'],
      cursorRow: 0,
      cursorCol: 5,
      preferredCol: null,
      setLines: vi.fn(),
      setCursor: vi.fn(),
      setPreferredCol: vi.fn(),
      getCurrentLine: vi.fn(() => 'hello world'),
      getCurrentLineLength: vi.fn(() => 11),
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

  describe('replaceRange', () => {
    it('should not fail - useRangeOperations is now implemented', () => {
      expect(() => {
        renderHook(() =>
          useRangeOperations(
            mockLogicalState as UseLogicalTextStateReturn,
            mockHistoryState as UseHistoryStateReturn,
          ),
        );
      }).not.toThrow();
    });

    it('should replace text within single line', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(0, 6, 0, 11, 'universe');
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalledWith(
        {
          lines: ['hello world', 'second line', 'third line'],
          cursorRow: 0,
          cursorCol: 5,
        },
        { skipCallbacks: undefined },
      );

      // Should update lines to replace 'world' with 'universe'
      expect(mockLogicalState.setLines).toHaveBeenCalledWith([
        'hello universe',
        'second line',
        'third line',
      ]);
      expect(mockLogicalState.setCursor).toHaveBeenCalledWith(0, 14); // cursor after 'universe'
      expect(mockLogicalState.setPreferredCol).toHaveBeenCalledWith(null);
    });

    it('should replace text across multiple lines', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(
          0,
          6,
          1,
          6,
          'replaced\ncontent',
        );
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      // Should replace from 'world' through 'second' with the new content
      expect(mockLogicalState.setLines).toHaveBeenCalled();
      expect(mockLogicalState.setCursor).toHaveBeenCalled();
    });

    it('should handle multi-line replacement text', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(
          0,
          0,
          0,
          5,
          'new\nmulti\nline',
        );
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.setLines).toHaveBeenCalled();
    });

    it('should return false for invalid range', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        // Invalid range: end before start
        const success = result.current.replaceRange(1, 5, 0, 3, 'invalid');
        expect(success).toBe(false);
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
      expect(mockLogicalState.setLines).not.toHaveBeenCalled();
    });

    it('should return false for out-of-bounds range', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        // Out of bounds: row 5 doesn't exist
        const success = result.current.replaceRange(0, 0, 5, 0, 'invalid');
        expect(success).toBe(false);
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
      expect(mockLogicalState.setLines).not.toHaveBeenCalled();
    });

    it('should handle empty replacement text', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(0, 6, 0, 11, '');
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      // Should delete the range without inserting anything
      expect(mockLogicalState.setLines).toHaveBeenCalledWith([
        'hello ',
        'second line',
        'third line',
      ]);
    });

    it('should normalize line endings in replacement text', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(
          0,
          0,
          0,
          5,
          'line1\r\nline2\rline3',
        );
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      // Should normalize \r\n and \r to \n
      expect(mockLogicalState.setLines).toHaveBeenCalled();
    });
  });

  describe('replaceRangeByOffset', () => {
    it('should convert offsets to positions and call replaceRange', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRangeByOffset(0, 5, 'replaced');
        expect(success).toBe(true);
      });

      // Should have called pushUndo which indicates replaceRange was called
      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.setLines).toHaveBeenCalled();
    });

    it('should handle multi-line text with offset calculation', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        // Offset that should span into second line
        const success = result.current.replaceRangeByOffset(10, 20, 'spanning');
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.setLines).toHaveBeenCalled();
    });

    it('should handle edge case offsets', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        // Zero-length range
        const success = result.current.replaceRangeByOffset(5, 5, 'insert');
        expect(success).toBe(true);
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.setLines).toHaveBeenCalled();
    });

    it('should handle invalid offsets gracefully', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      const mockReplaceRange = vi.fn(() => false);
      result.current.replaceRange = mockReplaceRange;

      act(() => {
        // Negative offsets
        const success = result.current.replaceRangeByOffset(-1, 5, 'invalid');
        expect(success).toBe(false);
      });
    });
  });

  describe('setText', () => {
    it('should replace entire document with new text', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText('completely new\ndocument content');
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalledWith(
        {
          lines: ['hello world', 'second line', 'third line'],
          cursorRow: 0,
          cursorCol: 5,
        },
        { skipCallbacks: undefined },
      );

      expect(mockLogicalState.setLines).toHaveBeenCalledWith([
        'completely new',
        'document content',
      ]);
      // Cursor should be placed at end of new text
      expect(mockLogicalState.setCursor).toHaveBeenCalledWith(1, 16); // end of 'document content'
      expect(mockLogicalState.setPreferredCol).toHaveBeenCalledWith(null);
    });

    it('should handle empty text', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText('');
      });

      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
      expect(mockLogicalState.setLines).toHaveBeenCalledWith(['']); // Should have at least one empty line
      expect(mockLogicalState.setCursor).toHaveBeenCalledWith(0, 0);
    });

    it('should normalize line endings', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText('line1\r\nline2\rline3\nline4');
      });

      expect(mockLogicalState.setLines).toHaveBeenCalledWith([
        'line1',
        'line2',
        'line3',
        'line4',
      ]);
    });

    it('should handle single line text', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText('single line text');
      });

      expect(mockLogicalState.setLines).toHaveBeenCalledWith([
        'single line text',
      ]);
      expect(mockLogicalState.setCursor).toHaveBeenCalledWith(0, 16); // end of line
    });

    it('should handle text with only newlines', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText('\n\n\n');
      });

      expect(mockLogicalState.setLines).toHaveBeenCalledWith(['', '', '', '']);
      expect(mockLogicalState.setCursor).toHaveBeenCalledWith(3, 0); // last line, column 0
    });
  });

  describe('integration scenarios', () => {
    it('should maintain consistency across operations', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        // Sequence of operations
        result.current.replaceRange(0, 0, 0, 5, 'NEW');
        result.current.setText('reset document');
        result.current.replaceRangeByOffset(0, 5, 'START');
      });

      // Should have called pushUndo for each operation
      expect(mockHistoryState.pushUndo).toHaveBeenCalledTimes(3);
    });

    it('should handle edge cases with cursor positioning', () => {
      mockLogicalState.lines = [''];
      mockLogicalState.cursorRow = 0;
      mockLogicalState.cursorCol = 0;

      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText('new content');
      });

      expect(mockLogicalState.setCursor).toHaveBeenCalledWith(0, 11);
    });
  });

  describe('error handling', () => {
    it('should handle invalid line indices gracefully', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(-1, 0, 100, 0, 'invalid');
        expect(success).toBe(false);
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
    });

    it('should handle invalid column indices gracefully', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        const success = result.current.replaceRange(0, -1, 0, 1000, 'invalid');
        expect(success).toBe(false);
      });

      expect(mockHistoryState.pushUndo).not.toHaveBeenCalled();
    });

    it('should handle null/undefined input gracefully', () => {
      const { result } = renderHook(() =>
        useRangeOperations(
          mockLogicalState as UseLogicalTextStateReturn,
          mockHistoryState as UseHistoryStateReturn,
        ),
      );

      act(() => {
        result.current.setText(null as unknown);
      });

      // Should still call the underlying functions, they'll handle the null
      expect(mockHistoryState.pushUndo).toHaveBeenCalled();
    });
  });
});
