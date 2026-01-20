/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readStdin } from './readStdin.js';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

// Mock process.stdin
const mockStdin = {
  setEncoding: vi.fn(),
  read: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  destroy: vi.fn(),
  listeners: vi.fn().mockReturnValue([]),
  listenerCount: vi.fn().mockReturnValue(0),
};

describe('readStdin', () => {
  let originalStdin: typeof process.stdin;
  let onReadableHandler: () => void;
  let onEndHandler: () => void;
  let onErrorHandler: (err: Error) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    originalStdin = process.stdin;

    // Replace process.stdin with our mock
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });

    // Capture event handlers
    mockStdin.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'readable') onReadableHandler = handler as () => void;
        if (event === 'end') onEndHandler = handler as () => void;
        if (event === 'error') onErrorHandler = handler as (err: Error) => void;
      },
    );
    mockStdin.listeners.mockReturnValue([]);
    mockStdin.listenerCount.mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  it('should read and accumulate data from stdin', async () => {
    mockStdin.read
      .mockReturnValueOnce('I love ')
      .mockReturnValueOnce('Gemini!')
      .mockReturnValueOnce(null);

    const promise = readStdin();

    // Trigger readable event
    onReadableHandler();

    // Trigger end to resolve
    onEndHandler();

    await expect(promise).resolves.toBe('I love Gemini!');
  });

  it('should handle empty stdin input', async () => {
    mockStdin.read.mockReturnValue(null);

    const promise = readStdin();

    // Trigger end immediately
    onEndHandler();

    await expect(promise).resolves.toBe('');
  });

  // Emulate terminals where stdin is not TTY (eg: git bash)
  it('should timeout and resolve with empty string when no input is available', async () => {
    vi.useFakeTimers();

    const promise = readStdin();

    // Fast-forward past the timeout (to run test faster)
    vi.advanceTimersByTime(500);

    await expect(promise).resolves.toBe('');

    vi.useRealTimers();
  });

  it('should clear timeout once when data is received and resolve with data', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    mockStdin.read
      .mockReturnValueOnce('chunk1')
      .mockReturnValueOnce('chunk2')
      .mockReturnValueOnce(null);

    const promise = readStdin();

    // Trigger readable event
    onReadableHandler();

    expect(clearTimeoutSpy).toHaveBeenCalledOnce();

    // Trigger end to resolve
    onEndHandler();

    await expect(promise).resolves.toBe('chunk1chunk2');
  });

  it('should truncate input if it exceeds MAX_STDIN_SIZE', async () => {
    const MAX_STDIN_SIZE = 8 * 1024 * 1024;
    const largeChunk = 'a'.repeat(MAX_STDIN_SIZE + 100);
    mockStdin.read.mockReturnValueOnce(largeChunk).mockReturnValueOnce(null);

    const promise = readStdin();
    onReadableHandler();

    await expect(promise).resolves.toBe('a'.repeat(MAX_STDIN_SIZE));
    expect(debugLogger.warn).toHaveBeenCalledWith(
      `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
    );
    expect(mockStdin.destroy).toHaveBeenCalled();
  });

  it('should handle stdin error', async () => {
    const promise = readStdin();
    const error = new Error('stdin error');
    onErrorHandler(error);
    await expect(promise).rejects.toThrow('stdin error');
  });
});
