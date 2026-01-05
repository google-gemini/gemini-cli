/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
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

  const renderMessageQueueHook = (initialProps: {
    isConfigInitialized: boolean;
    streamingState: StreamingState;
    submitQuery: (query: string) => void;
  }) => {
    let hookResult: ReturnType<typeof useMessageQueue>;
    function TestComponent(props: typeof initialProps) {
      hookResult = useMessageQueue(props);
      return null;
    }
    const { rerender } = render(<TestComponent {...initialProps} />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: Partial<typeof initialProps>) =>
        rerender(<TestComponent {...initialProps} {...newProps} />),
    };
  };

  it('should initialize with empty queue', () => {
    const { result } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Idle,
      submitQuery: mockSubmitQuery,
    });

    expect(result.current.messageQueue).toEqual([]);
    expect(result.current.getQueuedMessagesText()).toBe('');
  });

  it('should add messages to queue', () => {
    const { result } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

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
    const { result } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

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
    const { result } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

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
    const { result } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
      result.current.addMessage('Message 3');
    });

    expect(result.current.getQueuedMessagesText()).toBe(
      'Message 1\n\nMessage 2\n\nMessage 3',
    );
  });

  it('should auto-submit queued messages when transitioning to Idle', async () => {
    const { result, rerender } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

    // Add some messages
    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });

    expect(result.current.messageQueue).toEqual(['Message 1', 'Message 2']);

    // Transition to Idle
    rerender({ streamingState: StreamingState.Idle });

    await waitFor(() => {
      expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
      expect(result.current.messageQueue).toEqual([]);
    });
  });

  it('should not auto-submit when queue is empty', () => {
    const { rerender } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

    // Transition to Idle with empty queue
    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
  });

  it('should not auto-submit when not transitioning to Idle', () => {
    const { result, rerender } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Responding,
      submitQuery: mockSubmitQuery,
    });

    // Add messages
    act(() => {
      result.current.addMessage('Message 1');
    });

    // Transition to WaitingForConfirmation (not Idle)
    rerender({ streamingState: StreamingState.WaitingForConfirmation });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
    expect(result.current.messageQueue).toEqual(['Message 1']);
  });

  it('should handle multiple state transitions correctly', async () => {
    const { result, rerender } = renderMessageQueueHook({
      isConfigInitialized: true,
      streamingState: StreamingState.Idle,
      submitQuery: mockSubmitQuery,
    });

    // Start responding
    rerender({ streamingState: StreamingState.Responding });

    // Add messages while responding
    act(() => {
      result.current.addMessage('First batch');
    });

    // Go back to idle - should submit
    rerender({ streamingState: StreamingState.Idle });

    await waitFor(() => {
      expect(mockSubmitQuery).toHaveBeenCalledWith('First batch');
      expect(result.current.messageQueue).toEqual([]);
    });

    // Start responding again
    rerender({ streamingState: StreamingState.Responding });

    // Add more messages
    act(() => {
      result.current.addMessage('Second batch');
    });

    // Go back to idle - should submit again
    rerender({ streamingState: StreamingState.Idle });

    await waitFor(() => {
      expect(mockSubmitQuery).toHaveBeenCalledWith('Second batch');
      expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('popAllMessages', () => {
    it('should pop all messages and return them joined with double newlines', () => {
      const { result } = renderMessageQueueHook({
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
      });

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
        poppedMessages = result.current.popAllMessages();
      });

      expect(poppedMessages).toBe('Message 1\n\nMessage 2\n\nMessage 3');
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should return undefined when queue is empty', () => {
      const { result } = renderMessageQueueHook({
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
      });

      let poppedMessages: string | undefined = 'not-undefined';
      act(() => {
        poppedMessages = result.current.popAllMessages();
      });

      expect(poppedMessages).toBeUndefined();
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should handle single message correctly', () => {
      const { result } = renderMessageQueueHook({
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
      });

      act(() => {
        result.current.addMessage('Single message');
      });

      let poppedMessages: string | undefined;
      act(() => {
        poppedMessages = result.current.popAllMessages();
      });

      expect(poppedMessages).toBe('Single message');
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should clear the entire queue after popping', () => {
      const { result } = renderMessageQueueHook({
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
      });

      act(() => {
        result.current.addMessage('Message 1');
        result.current.addMessage('Message 2');
      });

      act(() => {
        result.current.popAllMessages();
      });

      // Queue should be empty
      expect(result.current.messageQueue).toEqual([]);
      expect(result.current.getQueuedMessagesText()).toBe('');

      // Popping again should return undefined
      let secondPop: string | undefined = 'not-undefined';
      act(() => {
        secondPop = result.current.popAllMessages();
      });

      expect(secondPop).toBeUndefined();
    });

    it('should work correctly with state updates', () => {
      const { result } = renderMessageQueueHook({
        isConfigInitialized: true,
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
      });

      // Add messages
      act(() => {
        result.current.addMessage('First');
        result.current.addMessage('Second');
      });

      // Pop all messages
      let firstPop: string | undefined;
      act(() => {
        firstPop = result.current.popAllMessages();
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
        secondPop = result.current.popAllMessages();
      });

      expect(secondPop).toBe('Third\n\nFourth');
      expect(result.current.messageQueue).toEqual([]);
    });
  });
});
