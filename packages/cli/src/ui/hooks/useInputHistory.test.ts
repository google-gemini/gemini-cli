/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useInputHistory } from './useInputHistory.js';

describe('useInputHistory', () => {
  const mockOnSubmit = vi.fn();
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const userMessages = ['message 1', 'message 2', 'message 3'];

  it('should initialize with historyIndex -1 and empty originalQueryBeforeNav', () => {
    const { result } = renderHook(() =>
      useInputHistory({
        userMessages: [],
        onSubmit: mockOnSubmit,
        isActive: true,
        currentQuery: '',
        currentCursorOffset: 0,
        onChange: mockOnChange,
      }),
    );

    // Internal state is not directly testable, but we can infer from behavior.
    // Attempting to navigate down should do nothing if historyIndex is -1.
    act(() => {
      result.current.navigateDown();
    });
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  describe('handleSubmit', () => {
    it('should call onSubmit with trimmed value and reset history', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '  test query  ',
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.handleSubmit('  submit value  ');
      });

      expect(mockOnSubmit).toHaveBeenCalledWith('submit value');
      // Check if history is reset (e.g., by trying to navigate down)
      act(() => {
        result.current.navigateDown();
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should not call onSubmit if value is empty after trimming', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '',
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.handleSubmit('   ');
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('navigateUp', () => {
    it('should not navigate if isActive is false', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: false,
          currentQuery: 'current',
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateUp();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should not navigate if userMessages is empty', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages: [],
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: 'current',
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateUp();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should call onChange with the last message when navigating up from initial state', () => {
      const currentQuery = 'current query';
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery,
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2], 'start'); // Last message
    });

    it('should store currentQuery and currentCursorOffset as original state on first navigateUp', () => {
      const currentQuery = 'original user input';
      const currentCursorOffset = 5;
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery,
          currentCursorOffset,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // historyIndex becomes 0
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2], 'start');

      // Navigate down to restore original query and cursor position
      act(() => {
        result.current.navigateDown(); // historyIndex becomes -1
      });
      expect(mockOnChange).toHaveBeenCalledWith(
        currentQuery,
        currentCursorOffset,
      );
    });

    it('should navigate through history messages on subsequent navigateUp calls', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '',
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 3'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2], 'start');

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 2'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[1], 'start');

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 1'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[0], 'start');
    });
  });

  describe('navigateDown', () => {
    it('should not navigate if isActive is false', () => {
      const initialProps = {
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true, // Start active to allow setup navigation
        currentQuery: 'current',
        currentCursorOffset: 0,
        onChange: mockOnChange,
      };
      const { result, rerender } = renderHook(
        (props) => useInputHistory(props),
        {
          initialProps,
        },
      );

      // First navigate up to have something in history
      act(() => {
        result.current.navigateUp();
      });
      mockOnChange.mockClear(); // Clear calls from setup

      // Set isActive to false for the actual test
      rerender({ ...initialProps, isActive: false });

      act(() => {
        const navigated = result.current.navigateDown();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should not navigate if historyIndex is -1 (not in history navigation)', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: 'current',
          currentCursorOffset: 0,
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateDown();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should restore cursor offset only when in middle of compose prompt', () => {
      const originalQuery = 'my original input';
      const originalCursorOffset = 5; // Middle
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: originalQuery,
          currentCursorOffset: originalCursorOffset,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp();
      });
      mockOnChange.mockClear();

      act(() => {
        result.current.navigateDown();
      });
      // Should restore middle offset
      expect(mockOnChange).toHaveBeenCalledWith(
        originalQuery,
        originalCursorOffset,
      );
    });

    it('should NOT restore cursor offset if it was at start or end of compose prompt', () => {
      const originalQuery = 'my original input';
      const { result, rerender } = renderHook(
        (props) => useInputHistory(props),
        {
          initialProps: {
            userMessages,
            onSubmit: mockOnSubmit,
            isActive: true,
            currentQuery: originalQuery,
            currentCursorOffset: 0, // Start
            onChange: mockOnChange,
          },
        },
      );

      // Case 1: Start
      act(() => {
        result.current.navigateUp();
      });
      mockOnChange.mockClear();
      act(() => {
        result.current.navigateDown();
      });
      // Should use 'end' default instead of 0
      expect(mockOnChange).toHaveBeenCalledWith(originalQuery, 'end');

      // Case 2: End
      rerender({
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true,
        currentQuery: originalQuery,
        currentCursorOffset: originalQuery.length, // End
        onChange: mockOnChange,
      });
      act(() => {
        result.current.navigateUp();
      });
      mockOnChange.mockClear();
      act(() => {
        result.current.navigateDown();
      });
      // Should use 'end' default
      expect(mockOnChange).toHaveBeenCalledWith(originalQuery, 'end');
    });

    it('should remember text edits but use default cursor when navigating between history items', () => {
      const originalQuery = 'my original input';
      const originalCursorOffset = 5;
      const { result, rerender } = renderHook(
        (props) => useInputHistory(props),
        {
          initialProps: {
            userMessages,
            onSubmit: mockOnSubmit,
            isActive: true,
            currentQuery: originalQuery,
            currentCursorOffset: originalCursorOffset,
            onChange: mockOnChange,
          },
        },
      );

      // 1. Navigate UP from compose prompt (-1 -> 0)
      act(() => {
        result.current.navigateUp();
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2], 'start');
      mockOnChange.mockClear();

      // Simulate being at History[0] ('message 3') and editing it
      const editedHistoryText = 'message 3 edited';
      const editedHistoryOffset = 5;
      rerender({
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true,
        currentQuery: editedHistoryText,
        currentCursorOffset: editedHistoryOffset,
        onChange: mockOnChange,
      });

      // 2. Navigate UP to next history item (0 -> 1)
      act(() => {
        result.current.navigateUp();
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[1], 'start');
      mockOnChange.mockClear();

      // 3. Navigate DOWN back to History[0] (1 -> 0)
      act(() => {
        result.current.navigateDown();
      });
      // Should restore edited text AND the offset because we just came from History[0]
      expect(mockOnChange).toHaveBeenCalledWith(
        editedHistoryText,
        editedHistoryOffset,
      );
      mockOnChange.mockClear();

      // Simulate being at History[0] (restored) and navigating DOWN to compose prompt (0 -> -1)
      rerender({
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true,
        currentQuery: editedHistoryText,
        currentCursorOffset: editedHistoryOffset,
        onChange: mockOnChange,
      });

      // 4. Navigate DOWN to compose prompt
      act(() => {
        result.current.navigateDown();
      });
      // Level -1 should ALWAYS restore its offset if it was in the middle
      expect(mockOnChange).toHaveBeenCalledWith(
        originalQuery,
        originalCursorOffset,
      );
    });

    it('should restore offset for history items ONLY if returning from them immediately', () => {
      const originalQuery = 'my original input';
      const initialProps = {
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true,
        currentQuery: originalQuery,
        currentCursorOffset: 5,
        onChange: mockOnChange,
      };

      const { result, rerender } = renderHook(
        (props) => useInputHistory(props),
        {
          initialProps,
        },
      );

      // -1 -> 0 ('message 3')
      act(() => {
        result.current.navigateUp();
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2], 'start');
      const historyOffset = 4;
      // Manually update props to reflect current level
      rerender({
        ...initialProps,
        currentQuery: userMessages[2],
        currentCursorOffset: historyOffset,
      });

      // 0 -> 1 ('message 2')
      act(() => {
        result.current.navigateUp();
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[1], 'start');
      rerender({
        ...initialProps,
        currentQuery: userMessages[1],
        currentCursorOffset: 0,
      });

      // 1 -> 2 ('message 1')
      act(() => {
        result.current.navigateUp();
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[0], 'start');
      rerender({
        ...initialProps,
        currentQuery: userMessages[0],
        currentCursorOffset: 0,
      });

      mockOnChange.mockClear();

      // 2 -> 1 ('message 2')
      act(() => {
        result.current.navigateDown();
      });
      // 2 -> 1 is immediate back-and-forth.
      // But Level 1 offset was 0 (not in middle), so use 'end' default.
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[1], 'end');
      mockOnChange.mockClear();

      // Rerender to reflect Level 1 state
      rerender({
        ...initialProps,
        currentQuery: userMessages[1],
        currentCursorOffset: userMessages[1].length,
      });

      // 1 -> 0 ('message 3')
      act(() => {
        result.current.navigateDown();
      });
      // 1 -> 0 is NOT immediate (Level 2 was the last jump point).
      // So Level 0 SHOULD use default 'end' even though it has a middle offset saved.
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2], 'end');
    });
  });
});
