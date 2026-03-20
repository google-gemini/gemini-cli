/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useInlineEditBuffer } from './useInlineEditBuffer.js';

describe('useEditBuffer', () => {
  let mockOnCommit: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnCommit = vi.fn();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    expect(result.current.editState.editingKey).toBeNull();
    expect(result.current.editState.buffer).toBe('');
    expect(result.current.editState.cursorPos).toBe(0);
  });

  it('should start editing correctly', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('my-key', 'initial'));

    expect(result.current.editState.editingKey).toBe('my-key');
    expect(result.current.editState.buffer).toBe('initial');
    expect(result.current.editState.cursorPos).toBe(7); // End of string
  });

  it('should commit edit and reset state', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );

    act(() => result.current.startEditing('my-key', 'text'));
    act(() => result.current.commitEdit());

    expect(mockOnCommit).toHaveBeenCalledWith('my-key', 'text');
    expect(result.current.editState.editingKey).toBeNull();
    expect(result.current.editState.buffer).toBe('');
  });

  it('should move cursor left and right', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('key', 'ab')); // cursor at 2

    act(() => result.current.editDispatch({ type: 'MOVE_LEFT' }));
    expect(result.current.editState.cursorPos).toBe(1);

    act(() => result.current.editDispatch({ type: 'MOVE_LEFT' }));
    expect(result.current.editState.cursorPos).toBe(0);

    // Shouldn't go below 0
    act(() => result.current.editDispatch({ type: 'MOVE_LEFT' }));
    expect(result.current.editState.cursorPos).toBe(0);

    act(() => result.current.editDispatch({ type: 'MOVE_RIGHT' }));
    expect(result.current.editState.cursorPos).toBe(1);
  });

  it('should handle home and end', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('key', 'testing')); // cursor at 7

    act(() => result.current.editDispatch({ type: 'HOME' }));
    expect(result.current.editState.cursorPos).toBe(0);

    act(() => result.current.editDispatch({ type: 'END' }));
    expect(result.current.editState.cursorPos).toBe(7);
  });

  it('should delete characters to the left (backspace)', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('key', 'abc')); // cursor at 3

    act(() => result.current.editDispatch({ type: 'DELETE_LEFT' }));
    expect(result.current.editState.buffer).toBe('ab');
    expect(result.current.editState.cursorPos).toBe(2);

    // Move to start, shouldn't delete
    act(() => result.current.editDispatch({ type: 'HOME' }));
    act(() => result.current.editDispatch({ type: 'DELETE_LEFT' }));
    expect(result.current.editState.buffer).toBe('ab');
  });

  it('should delete characters to the right (delete tab)', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('key', 'abc'));
    act(() => result.current.editDispatch({ type: 'HOME' })); // cursor at 0

    act(() => result.current.editDispatch({ type: 'DELETE_RIGHT' }));
    expect(result.current.editState.buffer).toBe('bc');
    expect(result.current.editState.cursorPos).toBe(0);
  });

  it('should insert valid characters into string', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('key', 'ab'));
    act(() => result.current.editDispatch({ type: 'MOVE_LEFT' })); // cursor at 1

    act(() =>
      result.current.editDispatch({
        type: 'INSERT_CHAR',
        char: 'x',
        isNumberType: false,
      }),
    );
    expect(result.current.editState.buffer).toBe('axb');
    expect(result.current.editState.cursorPos).toBe(2);
  });

  it('should validate number character insertions', () => {
    const { result } = renderHook(() =>
      useInlineEditBuffer({ onCommit: mockOnCommit }),
    );
    act(() => result.current.startEditing('key', '12'));

    // Valid number char
    act(() =>
      result.current.editDispatch({
        type: 'INSERT_CHAR',
        char: '.',
        isNumberType: true,
      }),
    );
    expect(result.current.editState.buffer).toBe('12.');

    // Invalid number char
    act(() =>
      result.current.editDispatch({
        type: 'INSERT_CHAR',
        char: 'a',
        isNumberType: true,
      }),
    );
    expect(result.current.editState.buffer).toBe('12.'); // Unchanged
  });
});
