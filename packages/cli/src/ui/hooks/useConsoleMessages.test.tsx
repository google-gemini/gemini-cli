/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, useCallback } from 'react';
import { vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import { useConsoleMessages } from './useConsoleMessages.js';
import { CoreEvent, type ConsoleLogPayload } from '@google/gemini-cli-core';

// Mock coreEvents
let consoleLogHandler: ((payload: ConsoleLogPayload) => void) | undefined;

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    coreEvents: {
      on: vi.fn((event, handler) => {
        if (event === CoreEvent.ConsoleLog) {
          consoleLogHandler = handler;
        }
      }),
      off: vi.fn((event) => {
        if (event === CoreEvent.ConsoleLog) {
          consoleLogHandler = undefined;
        }
      }),
      emitConsoleLog: vi.fn(),
    },
  };
});

describe('useConsoleMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    consoleLogHandler = undefined;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const useTestableConsoleMessages = () => {
    const { ...rest } = useConsoleMessages();
    const log = useCallback((content: string) => {
      if (consoleLogHandler) {
        consoleLogHandler({ type: 'log', content });
      }
    }, []);
    const error = useCallback((content: string) => {
      if (consoleLogHandler) {
        consoleLogHandler({ type: 'error', content });
      }
    }, []);
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
    // clearTimeoutSpy.mockRestore() is handled by afterEach restoreAllMocks
  });

  it('should clean up the timeout on unmount', () => {
    const { result, unmount } = renderConsoleMessagesHook();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    act(() => {
      result.current.log('A message');
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
