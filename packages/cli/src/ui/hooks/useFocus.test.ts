/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { EventEmitter } from 'node:events';
import { useFocus } from './useFocus.js';
import { vi } from 'vitest';
import { useStdin, useStdout } from 'ink';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import React from 'react';

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

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(KeypressProvider, null, children);

describe('useFocus', () => {
  let stdin: EventEmitter;
  let stdout: { write: vi.Func };

  beforeEach(() => {
    stdin = new EventEmitter();
    stdin.resume = vi.fn();
    stdin.pause = vi.fn();
    stdout = { write: vi.fn() };
    mockedUseStdin.mockReturnValue({ stdin } as ReturnType<typeof useStdin>);
    mockedUseStdout.mockReturnValue({ stdout } as unknown as ReturnType<
      typeof useStdout
    >);
  });

  afterEach(() => {
    vi.clearAllMocks();
    stdin.removeAllListeners();
  });

  it('should initialize with focus and enable focus reporting', () => {
    const { result } = renderHook(() => useFocus(), { wrapper });

    expect(result.current).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith('\x1b[?1004h');
  });

  it('should set isFocused to false when a focus-out event is received', () => {
    const { result } = renderHook(() => useFocus(), { wrapper });

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
    const { result } = renderHook(() => useFocus(), { wrapper });

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
    const { unmount } = renderHook(() => useFocus(), { wrapper });

    // At this point we should have listeners from both KeypressProvider and useFocus
    const listenerCountAfterMount = stdin.listenerCount('data');
    expect(listenerCountAfterMount).toBeGreaterThanOrEqual(1);

    unmount();

    // Assert that the cleanup function was called
    expect(stdout.write).toHaveBeenCalledWith('\x1b[?1004l');
    // Ensure useFocus listener was removed (but KeypressProvider listeners may remain)
    expect(stdin.listenerCount('data')).toBeLessThan(listenerCountAfterMount);
  });

  it('should handle multiple focus events correctly', () => {
    const { result } = renderHook(() => useFocus(), { wrapper });

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

  it('restores focus on keypress after focus is lost', () => {
    const { result } = renderHook(() => useFocus(), { wrapper });

    // Simulate focus-out event
    act(() => {
      stdin.emit('data', Buffer.from('\x1b[O'));
    });
    expect(result.current).toBe(false);

    // Simulate a keypress
    act(() => {
      stdin.emit('data', Buffer.from('a'));
    });
    expect(result.current).toBe(true);
  });
});
