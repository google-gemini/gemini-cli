/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
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
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]); // Last message
    });

    it('should store currentQuery as originalQueryBeforeNav on first navigateUp', () => {
      const currentQuery = 'original user input';
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // historyIndex becomes 0
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]);

      // Navigate down to restore original query
      act(() => {
        result.current.navigateDown(); // historyIndex becomes -1
      });
      expect(mockOnChange).toHaveBeenCalledWith(currentQuery);
    });

    it('should navigate through history messages on subsequent navigateUp calls', () => {
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: '',
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 3'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]);

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 2'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[1]);

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 1'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[0]);
    });
  });

  describe('navigateDown', () => {
    it('should not navigate if isActive is false', () => {
      const initialProps = {
        userMessages,
        onSubmit: mockOnSubmit,
        isActive: true, // Start active to allow setup navigation
        currentQuery: 'current',
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
          onChange: mockOnChange,
        }),
      );
      act(() => {
        const navigated = result.current.navigateDown();
        expect(navigated).toBe(false);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should restore originalQueryBeforeNav when navigating down to initial state', () => {
      const originalQuery = 'my original input';
      const { result } = renderHook(() =>
        useInputHistory({
          userMessages,
          onSubmit: mockOnSubmit,
          isActive: true,
          currentQuery: originalQuery,
          onChange: mockOnChange,
        }),
      );

      act(() => {
        result.current.navigateUp(); // Navigates to 'message 3', stores 'originalQuery'
      });
      expect(mockOnChange).toHaveBeenCalledWith(userMessages[2]);
      mockOnChange.mockClear();

      act(() => {
        result.current.navigateDown(); // Navigates back to original query
      });
      expect(mockOnChange).toHaveBeenCalledWith(originalQuery);
    });
  });
});
