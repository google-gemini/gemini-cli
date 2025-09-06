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
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQuery,
        messageQueueMode: 'wait_for_idle',
      }),
    );

    expect(result.current.messageQueue).toEqual([]);
    expect(result.current.getQueuedMessagesText()).toBe('');
  });

  it('should add messages to queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue({
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        messageQueueMode: 'wait_for_idle',
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
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        messageQueueMode: 'wait_for_idle',
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
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        messageQueueMode: 'wait_for_idle',
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
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        messageQueueMode: 'wait_for_idle',
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
          streamingState,
          submitQuery: mockSubmitQuery,
          messageQueueMode: 'wait_for_idle',
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
          streamingState,
          submitQuery: mockSubmitQuery,
          messageQueueMode: 'wait_for_idle',
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
          streamingState,
          submitQuery: mockSubmitQuery,
          messageQueueMode: 'wait_for_idle',
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
          streamingState,
          submitQuery: mockSubmitQuery,
          messageQueueMode: 'wait_for_idle',
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

  describe("with messageQueueMode = 'wait_for_response'", () => {
    it('should auto-submit queued messages when transitioning to ResponseComplete', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_response',
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

      // Transition to ResponseComplete
      rerender({ streamingState: StreamingState.ResponseComplete });

      expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should auto-submit queued messages when transitioning to WaitingForConfirmation', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_response',
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

      // Transition to WaitingForConfirmation
      rerender({ streamingState: StreamingState.WaitingForConfirmation });

      expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should auto-submit queued messages when transitioning to Idle', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_response',
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

    it('should not auto-submit when transitioning to ResponseComplete in wait_for_idle mode', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_idle',
          }),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      // Add messages
      act(() => {
        result.current.addMessage('Message 1');
      });

      // Transition to ResponseComplete (not Idle)
      rerender({ streamingState: StreamingState.ResponseComplete });

      expect(mockSubmitQuery).not.toHaveBeenCalled();
      expect(result.current.messageQueue).toEqual(['Message 1']);
    });

    it('should immediately submit when AI finishes responding (text-only, no tools)', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_response',
          }),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      // Add messages while AI is responding
      act(() => {
        result.current.addMessage('Follow-up question');
        result.current.addMessage('Another question');
      });

      expect(result.current.messageQueue).toEqual([
        'Follow-up question',
        'Another question',
      ]);

      // AI finishes responding (text-only, no tools) - should trigger ResponseComplete briefly
      rerender({ streamingState: StreamingState.ResponseComplete });

      // Should immediately submit the queued messages
      expect(mockSubmitQuery).toHaveBeenCalledWith(
        'Follow-up question\n\nAnother question',
      );
      expect(result.current.messageQueue).toEqual([]);
    });
  });

  describe('Integration: Real timing behavior', () => {
    it('should handle realistic ResponseComplete timing with wait_for_response mode', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_response',
          }),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      // Add messages while AI is responding
      act(() => {
        result.current.addMessage('Quick follow-up');
      });

      expect(result.current.messageQueue).toEqual(['Quick follow-up']);

      // Simulate the real behavior: briefly go to ResponseComplete
      // This should trigger immediate submission in wait_for_response mode
      act(() => {
        rerender({ streamingState: StreamingState.ResponseComplete });
      });

      // Should immediately submit since we're in wait_for_response mode
      expect(mockSubmitQuery).toHaveBeenCalledWith('Quick follow-up');
      expect(result.current.messageQueue).toEqual([]);

      // Then transition to Idle (as would happen in real implementation)
      act(() => {
        rerender({ streamingState: StreamingState.Idle });
      });

      // Should not trigger again since queue is already empty
      expect(mockSubmitQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle race condition gracefully in wait_for_response mode', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useMessageQueue({
            streamingState,
            submitQuery: mockSubmitQuery,
            messageQueueMode: 'wait_for_response',
          }),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      // Add message
      act(() => {
        result.current.addMessage('Test message');
      });

      // Rapid state changes that could cause race conditions
      act(() => {
        rerender({ streamingState: StreamingState.ResponseComplete });
      });

      // Should have processed the queue on ResponseComplete
      expect(mockSubmitQuery).toHaveBeenCalledWith('Test message');
      expect(result.current.messageQueue).toEqual([]);

      // Immediately transition to Idle
      act(() => {
        rerender({ streamingState: StreamingState.Idle });
      });

      // Should not trigger again since queue is already empty
      expect(mockSubmitQuery).toHaveBeenCalledTimes(1);
    });
  });
});
