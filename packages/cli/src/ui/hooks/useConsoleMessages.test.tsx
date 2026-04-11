/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, useCallback } from 'react';
import { vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import {
  useConsoleMessages,
  useErrorCount,
  initializeConsoleStore,
} from './useConsoleMessages.js';
import { coreEvents } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal();
  const handlers = new Map<string, (payload: unknown) => void>();

  return {
    ...(actual as Record<string, unknown>),
    coreEvents: {
      ...((actual as Record<string, unknown>)['coreEvents'] as Record<
        string,
        unknown
      >),
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn((event: string) => {
        handlers.delete(event);
      }),
      // Helper for testing to trigger the handlers
      _trigger: (event: string, payload: unknown) => {
        handlers.get(event)?.(payload);
      },
    },
  };
});

describe('useConsoleMessages', () => {
  let unmounts: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    initializeConsoleStore();
  });

  afterEach(() => {
    for (const unmount of unmounts) {
      try {
        unmount();
      } catch {
        // Ignore unmount errors
      }
    }
    unmounts = [];
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const useTestableConsoleMessages = () => {
    const consoleMessages = useConsoleMessages();
    const log = useCallback((content: string) => {
      // @ts-expect-error - internal testing helper
      coreEvents._trigger('console-log', { type: 'log', content });
    }, []);
    const error = useCallback((content: string) => {
      // @ts-expect-error - internal testing helper
      coreEvents._trigger('console-log', { type: 'error', content });
    }, []);
    const clearConsoleMessages = useCallback(() => {
      initializeConsoleStore();
    }, []);
    return {
      consoleMessages,
      log,
      error,
      clearConsoleMessages,
    };
  };

  const renderConsoleMessagesHook = async () => {
    let hookResult: ReturnType<typeof useTestableConsoleMessages> | undefined;
    function TestComponent() {
      hookResult = useTestableConsoleMessages();
      return null;
    }
    const { unmount } = await render(<TestComponent />);
    unmounts.push(unmount);
    return {
      result: {
        get current() {
          return hookResult!;
        },
      },
      unmount,
    };
  };

  it('should initialize with an empty array of console messages', async () => {
    const { result } = await renderConsoleMessagesHook();
    expect(result.current.consoleMessages).toEqual([]);
  });

  it('should add a new message when log is called', async () => {
    const { result } = await renderConsoleMessagesHook();

    act(() => {
      result.current.log('Test message');
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { type: 'log', content: 'Test message', count: 1 },
    ]);
  });

  it('should batch and count identical consecutive messages', async () => {
    const { result } = await renderConsoleMessagesHook();

    act(() => {
      result.current.log('Test message');
      result.current.log('Test message');
      result.current.log('Test message');
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { type: 'log', content: 'Test message', count: 3 },
    ]);
  });

  it('should not batch different messages', async () => {
    const { result } = await renderConsoleMessagesHook();

    act(() => {
      result.current.log('First message');
      result.current.error('Second message');
      vi.runAllTimers();
    });

    expect(result.current.consoleMessages).toEqual([
      { type: 'log', content: 'First message', count: 1 },
      { type: 'error', content: 'Second message', count: 1 },
    ]);
  });
});

describe('useErrorCount', () => {
  let unmounts: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    initializeConsoleStore();
  });

  afterEach(() => {
    for (const unmount of unmounts) {
      try {
        unmount();
      } catch {
        // Ignore unmount errors
      }
    }
    unmounts = [];
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderErrorCountHook = async () => {
    let hookResult: ReturnType<typeof useErrorCount>;
    function TestComponent() {
      hookResult = useErrorCount();
      return null;
    }
    const { unmount } = await render(<TestComponent />);
    unmounts.push(unmount);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      unmount,
    };
  };

  it('should initialize with an error count of 0', async () => {
    const { result } = await renderErrorCountHook();
    expect(result.current.errorCount).toBe(0);
  });

  it('should increment error count when an error is logged', async () => {
    const { result } = await renderErrorCountHook();
    act(() => {
      // @ts-expect-error - internal testing helper
      coreEvents._trigger('console-log', { type: 'error', content: 'error' });
      vi.runAllTimers();
    });
    expect(result.current.errorCount).toBe(1);
  });

  it('should not increment error count for non-error logs', async () => {
    const { result } = await renderErrorCountHook();
    act(() => {
      // @ts-expect-error - internal testing helper
      coreEvents._trigger('console-log', { type: 'log', content: 'log' });
      vi.runAllTimers();
    });
    expect(result.current.errorCount).toBe(0);
  });

  it('should clear the error count', async () => {
    const { result } = await renderErrorCountHook();
    act(() => {
      // @ts-expect-error - internal testing helper
      coreEvents._trigger('console-log', { type: 'error', content: 'error' });
      vi.runAllTimers();
    });
    expect(result.current.errorCount).toBe(1);

    act(() => {
      result.current.clearErrorCount();
    });
    expect(result.current.errorCount).toBe(0);
  });
});
