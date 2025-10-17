/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageQueue } from './useMessageQueue.js';
import { StreamingState } from '../types.js';

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
        isConfigInitialized: true,
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQuery,
      }),
    );

    expect(result.current.messageQueue).toEqual([]);
    expect(result.current.getQueuedMessagesText()).toBe('');
  });

  it('should add messages to queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
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
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
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
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
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
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
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
      ({ streamingState }) =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    // Add some messages
    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });

    expect(result.current.messageQueue).toEqual(['Message 1', 'Message 2']);

    // Transition to Idle
    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
    expect(result.current.messageQueue).toEqual([]);
  });

  it('should not auto-submit when queue is empty', () => {
    const { rerender } = renderHook(
      ({ streamingState }) =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    // Transition to Idle with empty queue
    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
  });

  it('should not auto-submit when not transitioning to Idle', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    // Add messages
    act(() => {
      result.current.addMessage('Message 1');
    });

    // Transition to WaitingForConfirmation (not Idle)
    rerender({ streamingState: StreamingState.WaitingForConfirmation });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
    expect(result.current.messageQueue).toEqual(['Message 1']);
  });

  it('should handle multiple state transitions correctly', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState,
          submitQuery: mockSubmitQuery,
        }),
      {
        initialProps: { streamingState: StreamingState.Idle },
      },
    );

    // Start responding
    rerender({ streamingState: StreamingState.Responding });

    // Add messages while responding
    act(() => {
      result.current.addMessage('First batch');
    });

    // Go back to idle - should submit
    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('First batch');
    expect(result.current.messageQueue).toEqual([]);

    // Start responding again
    rerender({ streamingState: StreamingState.Responding });

    // Add more messages
    act(() => {
      result.current.addMessage('Second batch');
    });

    // Go back to idle - should submit again
    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Second batch');
    expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
  });

  describe('popAllMessages', () => {
    it('should pop all messages and return them joined with double newlines', () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState: StreamingState.Responding,
          submitQuery: mockSubmitQuery,
        }),
      );

      // Add multiple messages
      act(() => {
        result.current.addMessage('Message 1');
        result.current.addMessage('Message 2');
        result.current.addMessage('Message 3');
      });

      expect(result.current.messageQueue).toEqual([
        'Message 1',
        'Message 2',
        'Message 3',
      ]);

      // Pop all messages
      let poppedMessages: string | undefined;
      act(() => {
        result.current.popAllMessages((messages) => {
          poppedMessages = messages;
        });
      });

      expect(poppedMessages).toBe('Message 1\n\nMessage 2\n\nMessage 3');
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should return undefined when queue is empty', () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState: StreamingState.Responding,
          submitQuery: mockSubmitQuery,
        }),
      );

      let poppedMessages: string | undefined = 'not-undefined';
      act(() => {
        result.current.popAllMessages((messages) => {
          poppedMessages = messages;
        });
      });

      expect(poppedMessages).toBeUndefined();
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should handle single message correctly', () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState: StreamingState.Responding,
          submitQuery: mockSubmitQuery,
        }),
      );

      act(() => {
        result.current.addMessage('Single message');
      });

      let poppedMessages: string | undefined;
      act(() => {
        result.current.popAllMessages((messages) => {
          poppedMessages = messages;
        });
      });

      expect(poppedMessages).toBe('Single message');
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should clear the entire queue after popping', () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState: StreamingState.Responding,
          submitQuery: mockSubmitQuery,
        }),
      );

      act(() => {
        result.current.addMessage('Message 1');
        result.current.addMessage('Message 2');
      });

      act(() => {
        result.current.popAllMessages(() => {});
      });

      // Queue should be empty
      expect(result.current.messageQueue).toEqual([]);
      expect(result.current.getQueuedMessagesText()).toBe('');

      // Popping again should return undefined
      let secondPop: string | undefined = 'not-undefined';
      act(() => {
        result.current.popAllMessages((messages) => {
          secondPop = messages;
        });
      });

      expect(secondPop).toBeUndefined();
    });

    it('should work correctly with state updates', () => {
      const { result } = renderHook(() =>
        useMessageQueue({
          isConfigInitialized: true,
          streamingState: StreamingState.Responding,
          submitQuery: mockSubmitQuery,
        }),
      );

      // Add messages
      act(() => {
        result.current.addMessage('First');
        result.current.addMessage('Second');
      });

      // Pop all messages
      let firstPop: string | undefined;
      act(() => {
        result.current.popAllMessages((messages) => {
          firstPop = messages;
        });
      });

      expect(firstPop).toBe('First\n\nSecond');

      // Add new messages after popping
      act(() => {
        result.current.addMessage('Third');
        result.current.addMessage('Fourth');
      });

      // Pop again
      let secondPop: string | undefined;
      act(() => {
        result.current.popAllMessages((messages) => {
          secondPop = messages;
        });
      });

      expect(secondPop).toBe('Third\n\nFourth');
      expect(result.current.messageQueue).toEqual([]);
    });
  });
});
