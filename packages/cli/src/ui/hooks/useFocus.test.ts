/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { EventEmitter } from 'events';
import { useFocus } from './useFocus.js';
import { vi } from 'vitest';
import { useStdin, useStdout } from 'ink';

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
  let stdin: EventEmitter;
  let stdout: { write: vi.Func };

  beforeEach(() => {
    stdin = new EventEmitter();
    stdout = { write: vi.fn() };
    mockedUseStdin.mockReturnValue({ stdin } as ReturnType<typeof useStdin>);
    mockedUseStdout.mockReturnValue({ stdout } as unknown as ReturnType<
      typeof useStdout
    >);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with focus and enable focus reporting', () => {
    const { result } = renderHook(() => useFocus());

    expect(result.current).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith('\x1b[?1004h');
  });

  it('should set isFocused to false when a focus-out event is received', () => {
    const { result } = renderHook(() => useFocus());

    // Initial state is focused
    expect(result.current).toBe(true);

    // Simulate focus-out event
    act(() => {
      stdin.emit('data', Buffer.from('\x1b[O'));
    });

    // State should now be unfocused
    expect(result.current).toBe(false);
  });

  it('should set isFocused to true when a focus-in event is received', () => {
    const { result } = renderHook(() => useFocus());

    // Simulate focus-out to set initial state to false
    act(() => {
      stdin.emit('data', Buffer.from('\x1b[O'));
    });
    expect(result.current).toBe(false);

    // Simulate focus-in event
    act(() => {
      stdin.emit('data', Buffer.from('\x1b[I'));
    });

    // State should now be focused
    expect(result.current).toBe(true);
  });

  it('should clean up and disable focus reporting on unmount', () => {
    const { unmount } = renderHook(() => useFocus());

    // Ensure listener was attached
    expect(stdin.listenerCount('data')).toBe(1);

    unmount();

    // Assert that the cleanup function was called
    expect(stdout.write).toHaveBeenCalledWith('\x1b[?1004l');
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it('should handle multiple focus events correctly', () => {
    const { result } = renderHook(() => useFocus());

    act(() => {
      stdin.emit('data', Buffer.from('\x1b[O'));
    });
    expect(result.current).toBe(false);

    act(() => {
      stdin.emit('data', Buffer.from('\x1b[O'));
    });
    expect(result.current).toBe(false);

    act(() => {
      stdin.emit('data', Buffer.from('\x1b[I'));
    });
    expect(result.current).toBe(true);

    act(() => {
      stdin.emit('data', Buffer.from('\x1b[I'));
    });
    expect(result.current).toBe(true);
  });
});
