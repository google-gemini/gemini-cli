/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { useInlineEdit } from './useInlineEdit.js';
import { cpLen } from '../utils/textUtils.js';

describe('useInlineEdit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return initial edit state', () => {
      const { result } = renderHook(() => useInlineEdit());

      expect(result.current.editState).toEqual({
        key: null,
        buffer: '',
        cursorPos: 0,
        cursorVisible: true,
      });
      expect(result.current.isEditing).toBe(false);
    });

    it('should return initial functions', () => {
      const { result } = renderHook(() => useInlineEdit());

      expect(typeof result.current.startEdit).toBe('function');
      expect(typeof result.current.updateBuffer).toBe('function');
      expect(typeof result.current.setBuffer).toBe('function');
      expect(typeof result.current.moveCursor).toBe('function');
      expect(typeof result.current.clearEdit).toBe('function');
      expect(typeof result.current.isEditing).toBe('boolean');
    });
  });

  describe('startEdit', () => {
    it('should start editing with empty buffer when no initial value provided', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting');
      });

      expect(result.current.editState).toEqual({
        key: 'test.setting',
        buffer: '',
        cursorPos: 0,
        cursorVisible: true,
      });
      expect(result.current.isEditing).toBe(true);
    });

    it('should start editing with provided initial value', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'initial value');
      });

      expect(result.current.editState).toEqual({
        key: 'test.setting',
        buffer: 'initial value',
        cursorPos: cpLen('initial value'),
        cursorVisible: true,
      });
      expect(result.current.isEditing).toBe(true);
    });

    it('should handle undefined initial value as empty string', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', undefined);
      });

      expect(result.current.editState).toEqual({
        key: 'test.setting',
        buffer: '',
        cursorPos: 0,
        cursorVisible: true,
      });
    });

    it('should override previous editing state', () => {
      const { result } = renderHook(() => useInlineEdit());

      // Start first edit
      act(() => {
        result.current.startEdit('first.setting', 'first value');
      });

      expect(result.current.editState.key).toBe('first.setting');
      expect(result.current.editState.buffer).toBe('first value');

      // Start second edit
      act(() => {
        result.current.startEdit('second.setting', 'second value');
      });

      expect(result.current.editState).toEqual({
        key: 'second.setting',
        buffer: 'second value',
        cursorPos: cpLen('second value'),
        cursorVisible: true,
      });
    });
  });

  describe('updateBuffer', () => {
    it('should update buffer and cursor position', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'initial');
      });

      act(() => {
        result.current.updateBuffer('updated text', 7);
      });

      expect(result.current.editState).toEqual({
        key: 'test.setting',
        buffer: 'updated text',
        cursorPos: 7,
        cursorVisible: true,
      });
    });

    it('should handle empty buffer', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'some text');
      });

      act(() => {
        result.current.updateBuffer('', 0);
      });

      expect(result.current.editState).toEqual({
        key: 'test.setting',
        buffer: '',
        cursorPos: 0,
        cursorVisible: true,
      });
    });

    it('should handle cursor at end of buffer', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'text');
      });

      const endPos = cpLen('text');
      act(() => {
        result.current.updateBuffer('text', endPos);
      });

      expect(result.current.editState.cursorPos).toBe(endPos);
    });
  });

  describe('setBuffer', () => {
    it('should set buffer while preserving cursor position', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'initial text');
      });

      act(() => {
        result.current.setBuffer('completely new text');
      });

      expect(result.current.editState).toEqual({
        key: 'test.setting',
        buffer: 'completely new text',
        cursorPos: cpLen('initial text'), // cursor position should be preserved when replacing the buffer
        cursorVisible: true,
      });
    });

    it('should handle empty buffer', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'some text');
      });

      act(() => {
        result.current.setBuffer('');
      });

      expect(result.current.editState.buffer).toBe('');
    });
  });

  describe('moveCursor', () => {
    it('should move cursor to specified position', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'text');
      });

      act(() => {
        result.current.moveCursor(2);
      });

      expect(result.current.editState.cursorPos).toBe(2);
    });

    it('should handle cursor at beginning', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'text');
      });

      act(() => {
        result.current.moveCursor(0);
      });

      expect(result.current.editState.cursorPos).toBe(0);
    });

    it('should handle cursor at end', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'text');
      });

      const endPos = cpLen('text');
      act(() => {
        result.current.moveCursor(endPos);
      });

      expect(result.current.editState.cursorPos).toBe(endPos);
    });
  });

  describe('clearEdit', () => {
    it('should reset to initial state', () => {
      const { result } = renderHook(() => useInlineEdit());

      // Start editing
      act(() => {
        result.current.startEdit('test.setting', 'some value');
      });

      // Modify state
      act(() => {
        result.current.updateBuffer('modified', 5);
      });

      expect(result.current.editState.key).toBe('test.setting');
      expect(result.current.editState.buffer).toBe('modified');

      // Clear edit
      act(() => {
        result.current.clearEdit();
      });

      expect(result.current.editState).toEqual({
        key: null,
        buffer: '',
        cursorPos: 0,
        cursorVisible: true,
      });
      expect(result.current.isEditing).toBe(false);
    });

    it('should work when not editing', () => {
      const { result } = renderHook(() => useInlineEdit());

      // Clear without starting edit
      act(() => {
        result.current.clearEdit();
      });

      expect(result.current.editState).toEqual({
        key: null,
        buffer: '',
        cursorPos: 0,
        cursorVisible: true,
      });
      expect(result.current.isEditing).toBe(false);
    });
  });

  describe('isEditing', () => {
    it('should be false initially', () => {
      const { result } = renderHook(() => useInlineEdit());
      expect(result.current.isEditing).toBe(false);
    });

    it('should be true when editing', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting');
      });

      expect(result.current.isEditing).toBe(true);
    });

    it('should be false after clearing edit', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting');
      });

      expect(result.current.isEditing).toBe(true);

      act(() => {
        result.current.clearEdit();
      });

      expect(result.current.isEditing).toBe(false);
    });
  });

  describe('cursor blinking', () => {
    it('should start blinking when editing begins', () => {
      const { result } = renderHook(() => useInlineEdit());

      expect(result.current.editState.cursorVisible).toBe(true);

      act(() => {
        result.current.startEdit('test.setting');
      });

      expect(result.current.editState.cursorVisible).toBe(true);

      // Advance time to trigger blink
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.editState.cursorVisible).toBe(false);
    });

    it('should stop blinking when editing ends', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting');
      });

      // Start blinking
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.editState.cursorVisible).toBe(false);

      // Clear edit
      act(() => {
        result.current.clearEdit();
      });

      // Cursor should reset to visible
      expect(result.current.editState.cursorVisible).toBe(true);
    });

    it('should continue blinking during editing', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting');
      });

      // Multiple blink cycles
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.editState.cursorVisible).toBe(false);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.editState.cursorVisible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.editState.cursorVisible).toBe(false);
    });

    it('should not blink when not editing', () => {
      const { result } = renderHook(() => useInlineEdit());

      // Advance time without editing
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.editState.cursorVisible).toBe(true);
    });
  });

  describe('complex editing scenarios', () => {
    it('should handle typing workflow', () => {
      const { result } = renderHook(() => useInlineEdit());

      // Start editing
      act(() => {
        result.current.startEdit('test.setting');
      });

      // Type some text
      act(() => {
        result.current.updateBuffer('h', 1);
      });
      expect(result.current.editState.buffer).toBe('h');

      act(() => {
        result.current.updateBuffer('hi', 2);
      });
      expect(result.current.editState.buffer).toBe('hi');

      // Move cursor and add more text
      act(() => {
        result.current.moveCursor(1);
      });
      act(() => {
        result.current.updateBuffer('hhi', 2);
      });
      expect(result.current.editState.cursorPos).toBe(2);

      // Clear and start over
      act(() => {
        result.current.clearEdit();
      });
      expect(result.current.editState.key).toBe(null);
    });

    it('should handle backspace workflow', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', 'hello');
      });

      // Move cursor and delete
      act(() => {
        result.current.moveCursor(3);
      });
      act(() => {
        result.current.updateBuffer('helo', 2);
      });

      expect(result.current.editState.buffer).toBe('helo');
      expect(result.current.editState.cursorPos).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters correctly', () => {
      const { result } = renderHook(() => useInlineEdit());

      act(() => {
        result.current.startEdit('test.setting', '🚀 emoji');
      });

      expect(result.current.editState.cursorPos).toBe(cpLen('🚀 emoji'));
    });

    it('should handle very long text', () => {
      const { result } = renderHook(() => useInlineEdit());

      const longText = 'a'.repeat(1000);
      act(() => {
        result.current.startEdit('test.setting', longText);
      });

      expect(result.current.editState.buffer).toBe(longText);
      expect(result.current.editState.cursorPos).toBe(cpLen(longText));
    });

    it('should handle rapid state changes', () => {
      const { result } = renderHook(() => useInlineEdit());

      // Rapid start/stop editing
      act(() => {
        result.current.startEdit('test.setting1');
      });
      act(() => {
        result.current.clearEdit();
      });
      act(() => {
        result.current.startEdit('test.setting2', 'value');
      });

      expect(result.current.editState.key).toBe('test.setting2');
      expect(result.current.editState.buffer).toBe('value');
    });
  });
});
