/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { act, useCallback } from 'react';
import { vi } from 'vitest';
import { useConsoleMessages } from './useConsoleMessages.js';

describe('useConsoleMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const useTestableConsoleMessages = () => {
    const { handleNewMessage, ...rest } = useConsoleMessages();
    const log = useCallback(
      (content: string) => handleNewMessage({ type: 'log', content, count: 1 }),
      [handleNewMessage],
    );
    const error = useCallback(
      (content: string) =>
        handleNewMessage({ type: 'error', content, count: 1 }),
      [handleNewMessage],
    );
    return {
      ...rest,
      log,
      error,
      clearConsoleMessages: rest.clearConsoleMessages,
    };
  };

  const renderConsoleMessagesHook = () => {
    let hookResult: ReturnType<typeof useTestableConsoleMessages>;
    function TestComponent() {
      hookResult = useTestableConsoleMessages();
      return null;
    }
    const { unmount } = render(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      unmount,
    };
  };

  it('should initialize with an empty array of console messages', () => {
    const { result } = renderConsoleMessagesHook();
    expect(result.current.consoleMessages).toEqual([]);
  });

  it('should add a new message when log is called', async () => {
    const { result } = renderConsoleMessagesHook();

    act(() => {
      result.current.log('Test message');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(result.current.consoleMessages).toEqual([
      { type: 'log', content: 'Test message', count: 1 },
    ]);
  });

  it('should batch and count identical consecutive messages', async () => {
    const { result } = renderConsoleMessagesHook();

    act(() => {
      result.current.log('Test message');
      result.current.log('Test message');
      result.current.log('Test message');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(result.current.consoleMessages).toEqual([
      { type: 'log', content: 'Test message', count: 3 },
    ]);
  });

  it('should not batch different messages', async () => {
    const { result } = renderConsoleMessagesHook();

    act(() => {
      result.current.log('First message');
      result.current.error('Second message');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(result.current.consoleMessages).toEqual([
      { type: 'log', content: 'First message', count: 1 },
      { type: 'error', content: 'Second message', count: 1 },
    ]);
  });

  it('should clear all messages when clearConsoleMessages is called', async () => {
    const { result } = renderConsoleMessagesHook();

    act(() => {
      result.current.log('A message');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(result.current.consoleMessages).toHaveLength(1);

    act(() => {
      result.current.clearConsoleMessages();
    });

    expect(result.current.consoleMessages).toHaveLength(0);
  });

  it('should clear the pending timeout when clearConsoleMessages is called', () => {
    const { result } = renderConsoleMessagesHook();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    act(() => {
      result.current.log('A message');
    });

    act(() => {
      result.current.clearConsoleMessages();
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should clean up the timeout on unmount', () => {
    const { result, unmount } = renderConsoleMessagesHook();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    act(() => {
      result.current.log('A message');
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
