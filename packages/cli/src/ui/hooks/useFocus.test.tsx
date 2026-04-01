/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { EventEmitter } from 'node:events';
import { useFocus } from './useFocus.js';
import { vi, type Mock } from 'vitest';
import { useStdin, useStdout } from 'ink';
import { act } from 'react';

// Mock the ink hooks
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
    useStdout: vi.fn(),
  };
});

const mockedUseStdin = vi.mocked(useStdin);
const mockedUseStdout = vi.mocked(useStdout);

describe('useFocus', () => {
  let stdin: EventEmitter & { resume: Mock; pause: Mock };
  let stdout: { write: Mock };

  beforeEach(() => {
    stdin = Object.assign(new EventEmitter(), {
      resume: vi.fn(),
      pause: vi.fn(),
    });
    stdout = { write: vi.fn() };
    mockedUseStdin.mockReturnValue({ stdin } as unknown as ReturnType<
      typeof useStdin
    >);
    mockedUseStdout.mockReturnValue({ stdout } as unknown as ReturnType<
      typeof useStdout
    >);
  });

  afterEach(() => {
    vi.clearAllMocks();
    stdin.removeAllListeners();
  });

  const renderFocusHook = async () => {
    let hookResult: ReturnType<typeof useFocus>;
    function TestComponent() {
      hookResult = useFocus();
      return null;
    }
    const { unmount } = await renderWithProviders(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      unmount,
    };
  };

  it('should initialize with focus and enable focus reporting', async () => {
    const { result } = await renderFocusHook();

    expect(result.current.isFocused).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith('\x1b[?1004h');
  });

  it('should set isFocused to false when a focus-out event is received', async () => {
    const { result } = await renderFocusHook();

    // Initial state is focused
    expect(result.current.isFocused).toBe(true);

    // Simulate focus-out event
    act(() => {
      stdin.emit('data', '\x1b[O');
    });

    // State should now be unfocused
    expect(result.current.isFocused).toBe(false);
  });

  it('should set isFocused to true when a focus-in event is received', async () => {
    const { result } = await renderFocusHook();

    // Simulate focus-out to set initial state to false
    act(() => {
      stdin.emit('data', '\x1b[O');
    });
    expect(result.current.isFocused).toBe(false);

    // Simulate focus-in event
    act(() => {
      stdin.emit('data', '\x1b[I');
    });

    // State should now be focused
    expect(result.current.isFocused).toBe(true);
  });

  it('should clean up and disable focus reporting on unmount', async () => {
    const { unmount } = await renderFocusHook();

    // At this point we should have listeners from both KeypressProvider and useFocus
    const listenerCountAfterMount = stdin.listenerCount('data');
    expect(listenerCountAfterMount).toBeGreaterThanOrEqual(1);

    unmount();

    // Assert that the cleanup function was called
    expect(stdout.write).toHaveBeenCalledWith('\x1b[?1004l');
    // Ensure useFocus listener was removed (but KeypressProvider listeners may remain)
    expect(stdin.listenerCount('data')).toBeLessThan(listenerCountAfterMount);
  });

  it('should handle multiple focus events correctly', async () => {
    const { result } = await renderFocusHook();

    act(() => {
      stdin.emit('data', '\x1b[O');
    });
    expect(result.current.isFocused).toBe(false);

    act(() => {
      stdin.emit('data', '\x1b[O');
    });
    expect(result.current.isFocused).toBe(false);

    act(() => {
      stdin.emit('data', '\x1b[I');
    });
    expect(result.current.isFocused).toBe(true);

    act(() => {
      stdin.emit('data', '\x1b[I');
    });
    expect(result.current.isFocused).toBe(true);
  });

  it('restores focus on keypress after focus is lost', async () => {
    const { result } = await renderFocusHook();

    // Simulate focus-out event
    act(() => {
      stdin.emit('data', '\x1b[O');
    });
    expect(result.current.isFocused).toBe(false);

    // Simulate a keypress
    act(() => {
      stdin.emit('data', 'a');
    });
    expect(result.current.isFocused).toBe(true);
  });

  it('tracks whether any focus event has been received', async () => {
    const { result } = await renderFocusHook();

    expect(result.current.hasReceivedFocusEvent).toBe(false);

    act(() => {
      stdin.emit('data', '\x1b[O');
    });

    expect(result.current.hasReceivedFocusEvent).toBe(true);
    expect(result.current.isFocused).toBe(false);
  });
});
