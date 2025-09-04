/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageQueue } from './useMessageQueue.js';

describe('useMessageQueue', () => {
  let mockSubmitQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSubmitQuery = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should initialize with empty queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        canSubmitQueries: true,
        submitQuery: mockSubmitQuery,
      }),
    );

    expect(result.current.messageQueue).toEqual([]);
    expect(result.current.getQueuedMessagesText()).toBe('');
  });

  it('should add messages to queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        canSubmitQueries: false,
        submitQuery: mockSubmitQuery,
      }),
    );

    act(() => {
      result.current.addMessage('Test message 1');
      result.current.addMessage('Test message 2');
    });

    expect(result.current.messageQueue).toEqual([
      'Test message 1',
      'Test message 2',
    ]);
  });

  it('should filter out empty messages', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        canSubmitQueries: false,
        submitQuery: mockSubmitQuery,
      }),
    );

    act(() => {
      result.current.addMessage('Valid message');
      result.current.addMessage('   '); // Only whitespace
      result.current.addMessage(''); // Empty
      result.current.addMessage('Another valid message');
    });

    expect(result.current.messageQueue).toEqual([
      'Valid message',
      'Another valid message',
    ]);
  });

  it('should clear queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        canSubmitQueries: false,
        submitQuery: mockSubmitQuery,
      }),
    );

    act(() => {
      result.current.addMessage('Test message');
    });

    expect(result.current.messageQueue).toEqual(['Test message']);

    act(() => {
      result.current.clearQueue();
    });

    expect(result.current.messageQueue).toEqual([]);
  });

  it('should return queued messages as text with double newlines', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        canSubmitQueries: false,
        submitQuery: mockSubmitQuery,
      }),
    );

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
      result.current.addMessage('Message 3');
    });

    expect(result.current.getQueuedMessagesText()).toBe(
      'Message 1\n\nMessage 2\n\nMessage 3',
    );
  });

  it('should auto-submit queued messages when transitioning to Idle', () => {
    const { result, rerender } = renderHook(
      ({ canSubmitQueries }) =>
        useMessageQueue({
          canSubmitQueries,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { canSubmitQueries: false },
      },
    );

    // Add some messages
    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });

    expect(result.current.messageQueue).toEqual(['Message 1', 'Message 2']);

    // Transition to Idle
    rerender({ canSubmitQueries: true });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
    expect(result.current.messageQueue).toEqual([]);
  });

  it('should not auto-submit when queue is empty', () => {
    const { rerender } = renderHook(
      ({ canSubmitQueries }) =>
        useMessageQueue({
          canSubmitQueries,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { canSubmitQueries: false },
      },
    );

    // Transition to Idle with empty queue
    rerender({ canSubmitQueries: true });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
  });

  it('should handle multiple state transitions correctly', () => {
    const { result, rerender } = renderHook(
      ({ canSubmitQueries }) =>
        useMessageQueue({
          canSubmitQueries,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { canSubmitQueries: true },
      },
    );

    // Start responding
    rerender({ canSubmitQueries: false });

    // Add messages while responding
    act(() => {
      result.current.addMessage('First batch');
    });

    // Go back to idle - should submit
    rerender({ canSubmitQueries: true });

    expect(mockSubmitQuery).toHaveBeenCalledWith('First batch');
    expect(result.current.messageQueue).toEqual([]);

    // Start responding again
    rerender({ canSubmitQueries: false });

    // Add more messages
    act(() => {
      result.current.addMessage('Second batch');
    });

    // Go back to idle - should submit again
    rerender({ canSubmitQueries: true });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Second batch');
    expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
  });
});
