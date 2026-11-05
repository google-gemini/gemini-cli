/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PassThrough } from 'node:stream';
import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readStdin } from './readStdin.js';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

interface MockStdin {
  isTTY?: boolean;
  destroyed?: boolean;
  readableEnded?: boolean;
  setEncoding: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  unpipe: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  listeners: ReturnType<typeof vi.fn>;
  listenerCount: ReturnType<typeof vi.fn>;
}

describe('readStdin', () => {
  let originalStdin: typeof process.stdin;
  let mockStdin: MockStdin;
  let onReadableHandler: () => void;
  let onEndHandler: () => void;
  let onErrorHandler: (err: Error) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    originalStdin = process.stdin;

    mockStdin = {
      isTTY: false,
      destroyed: false,
      readableEnded: false,
      setEncoding: vi.fn(),
      read: vi.fn().mockReturnValue(null),
      on: vi.fn(),
      removeListener: vi.fn(),
      unpipe: vi.fn(),
      pause: vi.fn(),
      destroy: vi.fn(),
      listeners: vi.fn().mockReturnValue([]),
      listenerCount: vi.fn().mockReturnValue(0),
    };

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
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('should handle Buffer chunks from stdin', async () => {
    mockStdin.read
      .mockReturnValueOnce(Buffer.from('Hello ', 'utf8'))
      .mockReturnValueOnce(Buffer.from('world!', 'utf8'))
      .mockReturnValueOnce(null);

    const promise = readStdin();
    onReadableHandler();
    onEndHandler();

    await expect(promise).resolves.toBe('Hello world!');
  });

  it('should handle empty stdin input', async () => {
    mockStdin.read.mockReturnValue(null);

    const promise = readStdin();

    // Trigger end immediately
    onEndHandler();

    await expect(promise).resolves.toBe('');
  });

  it('should immediately resolve with empty string when stdin is a TTY', async () => {
    mockStdin.isTTY = true;

    await expect(readStdin()).resolves.toBe('');
    expect(mockStdin.setEncoding).not.toHaveBeenCalled();
    expect(mockStdin.on).not.toHaveBeenCalled();
  });

  it('should immediately resolve with empty string when stdin is already ended or destroyed', async () => {
    mockStdin.readableEnded = true;
    await expect(readStdin()).resolves.toBe('');

    mockStdin.readableEnded = false;
    mockStdin.destroyed = true;
    await expect(readStdin()).resolves.toBe('');

    expect(mockStdin.on).not.toHaveBeenCalled();
  });

  it('should wait for slow piped input arriving after 500ms instead of resolving empty', async () => {
    vi.useFakeTimers();

    let settled = false;
    const promise = readStdin().then((value) => {
      settled = true;
      return value;
    });

    // Advance well past the former 500ms cutoff while upstream pipe is slow
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);

    mockStdin.read
      .mockReturnValueOnce('delayed ')
      .mockReturnValueOnce('context')
      .mockReturnValueOnce(null);

    onReadableHandler();
    onEndHandler();

    await expect(promise).resolves.toBe('delayed context');
    expect(debugLogger.warn).not.toHaveBeenCalled();
  });

  it('should accumulate slow multi-chunk piped input separated by long delays', async () => {
    vi.useFakeTimers();

    const promise = readStdin();

    await vi.advanceTimersByTimeAsync(800);
    mockStdin.read.mockReturnValueOnce('chunk1-').mockReturnValueOnce(null);
    onReadableHandler();

    await vi.advanceTimersByTimeAsync(2000);
    mockStdin.read.mockReturnValueOnce('chunk2').mockReturnValueOnce(null);
    onReadableHandler();

    onEndHandler();

    await expect(promise).resolves.toBe('chunk1-chunk2');
  });

  it('should truncate input if it exceeds MAX_STDIN_SIZE and pause+unpipe without destroying stdin', async () => {
    vi.useFakeTimers();
    const MAX_STDIN_SIZE = 8 * 1024 * 1024;
    const largeChunk = 'a'.repeat(MAX_STDIN_SIZE + 100);
    mockStdin.read.mockReturnValueOnce(largeChunk).mockReturnValueOnce(null);

    const promise = readStdin();
    await vi.advanceTimersByTimeAsync(1000);
    onReadableHandler();

    await expect(promise).resolves.toBe('a'.repeat(MAX_STDIN_SIZE));
    expect(debugLogger.warn).toHaveBeenCalledWith(
      `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
    );
    expect(mockStdin.unpipe).toHaveBeenCalledOnce();
    expect(mockStdin.pause).toHaveBeenCalledOnce();
    expect(mockStdin.destroy).not.toHaveBeenCalled();
  });

  it('should truncate cleanly when exact MAX_STDIN_SIZE is followed by another chunk', async () => {
    const MAX_STDIN_SIZE = 8 * 1024 * 1024;
    mockStdin.read
      .mockReturnValueOnce('b'.repeat(MAX_STDIN_SIZE))
      .mockReturnValueOnce('extra')
      .mockReturnValueOnce(null);

    const promise = readStdin();
    onReadableHandler();

    await expect(promise).resolves.toBe('b'.repeat(MAX_STDIN_SIZE));
    expect(debugLogger.warn).toHaveBeenCalledWith(
      `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
    );
    expect(mockStdin.unpipe).toHaveBeenCalledOnce();
    expect(mockStdin.pause).toHaveBeenCalledOnce();
    expect(mockStdin.destroy).not.toHaveBeenCalled();
  });

  it('should preserve process.stdin for reuse after oversize truncation on a real stream', async () => {
    const MAX_STDIN_SIZE = 8 * 1024 * 1024;
    const realStream = new PassThrough() as PassThrough & { isTTY?: boolean };
    realStream.isTTY = false;

    Object.defineProperty(process, 'stdin', {
      value: realStream,
      writable: true,
      configurable: true,
    });

    const firstPromise = readStdin();
    realStream.write('x'.repeat(MAX_STDIN_SIZE + 1024));

    const firstResult = await firstPromise;
    expect(firstResult.length).toBe(MAX_STDIN_SIZE);
    expect(realStream.destroyed).toBe(false);
    expect(realStream.isPaused()).toBe(true);

    // Reuse the same process.stdin stream for subsequent reads
    const secondPromise = readStdin();
    realStream.write('follow-up input');
    realStream.end();

    await expect(secondPromise).resolves.toBe('follow-up input');
  });

  it('should truncate multi-byte characters at byte boundary', async () => {
    const MAX_STDIN_SIZE = 8 * 1024 * 1024;
    // '한' is 3 bytes. 2,796,202 * 3 = 8,388,606 bytes.
    // 2,796,203 * 3 = 8,388,609 bytes.
    const charCount = Math.floor(MAX_STDIN_SIZE / 3) + 1;
    const multiByteChunk = '한'.repeat(charCount);

    mockStdin.read
      .mockReturnValueOnce(multiByteChunk)
      .mockReturnValueOnce(null);

    const promise = readStdin();
    onReadableHandler();

    const result = await promise;
    const resultBytes = Buffer.byteLength(result, 'utf8');

    expect(resultBytes).toBeLessThanOrEqual(MAX_STDIN_SIZE);
    expect(resultBytes).toBe(Math.floor(MAX_STDIN_SIZE / 3) * 3);
    expect(result).not.toContain('\uFFFD'); // No replacement characters
  });

  it('should use byte length instead of string length for limit', async () => {
    const MAX_STDIN_SIZE = 8 * 1024 * 1024;
    // '한' is 3 bytes. If we use string length, we'd allow 8M characters = 24MB.
    // We want to ensure it stops at 8MB.
    const charCount = MAX_STDIN_SIZE; // 8M characters = 24MB
    const multiByteChunk = '한'.repeat(charCount);

    mockStdin.read
      .mockReturnValueOnce(multiByteChunk)
      .mockReturnValueOnce(null);

    const promise = readStdin();
    onReadableHandler();

    const result = await promise;
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(
      MAX_STDIN_SIZE,
    );
    expect(result.length).toBeLessThan(charCount);
  });

  it('should handle stdin error', async () => {
    const promise = readStdin();
    const error = new Error('stdin error');
    onErrorHandler(error);
    await expect(promise).rejects.toThrow('stdin error');
  });
});
