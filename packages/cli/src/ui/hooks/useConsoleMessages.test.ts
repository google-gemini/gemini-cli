/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { useConsoleMessages } from './useConsoleMessages.js';
import { ConsoleMessageItem } from '../types.js';

// Mock setTimeout and clearTimeout
vi.useFakeTimers();

describe('useConsoleMessages', () => {
  it('should initialize with an empty array of console messages', () => {
    const { result } = renderHook(() => useConsoleMessages());
    expect(result.current.consoleMessages).toEqual([]);
  });

  it('should add a new message', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
    });

    act(() => {
      vi.runAllTimers(); // Process the queue
    });

    expect(result.current.consoleMessages).toEqual([{ ...message, count: 1 }]);
  });

  it('should consolidate identical consecutive messages', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
      result.current.handleNewMessage(message);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([{ ...message, count: 2 }]);
  });

  it('should not consolidate different messages', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message1: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message 1',
      count: 1,
    };
    const message2: ConsoleMessageItem = {
      type: 'error',
      content: 'Test message 2',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message1);
      result.current.handleNewMessage(message2);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { ...message1, count: 1 },
      { ...message2, count: 1 },
    ]);
  });

  it('should not consolidate messages if type is different', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message1: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };
    const message2: ConsoleMessageItem = {
      type: 'error',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message1);
      result.current.handleNewMessage(message2);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { ...message1, count: 1 },
      { ...message2, count: 1 },
    ]);
  });

  it('should clear console messages', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toHaveLength(1);

    act(() => {
      result.current.clearConsoleMessages();
    });

    expect(result.current.consoleMessages).toEqual([]);
  });

  it('should clear pending timeout on clearConsoleMessages', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message); // This schedules a timeout
    });

    act(() => {
      result.current.clearConsoleMessages();
    });

    // Ensure the queue is empty and no more messages are processed
    act(() => {
      vi.runAllTimers(); // If timeout wasn't cleared, this would process the queue
    });

    expect(result.current.consoleMessages).toEqual([]);
  });

  it('should clear message queue on clearConsoleMessages', () => {
    const { result } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      // Add a message but don't process the queue yet
      result.current.handleNewMessage(message);
    });

    act(() => {
      result.current.clearConsoleMessages();
    });

    // Process any pending timeouts (should be none related to message queue)
    act(() => {
      vi.runAllTimers();
    });

    // The consoleMessages should be empty because the queue was cleared before processing
    expect(result.current.consoleMessages).toEqual([]);
  });

  it('should cleanup timeout on unmount', () => {
    const { result, unmount } = renderHook(() => useConsoleMessages());
    const message: ConsoleMessageItem = {
      type: 'log',
      content: 'Test message',
      count: 1,
    };

    act(() => {
      result.current.handleNewMessage(message);
    });

    unmount();

    // This is a bit indirect. We check that clearTimeout was called.
    // If clearTimeout was not called, and we run timers, an error might occur
    // or the state might change, which it shouldn't after unmount.
    // Vitest's vi.clearAllTimers() or specific checks for clearTimeout calls
    // would be more direct if available and easy to set up here.
    // For now, we rely on the useEffect cleanup pattern.
    expect(vi.getTimerCount()).toBe(0); // Check if all timers are cleared
  });
});
