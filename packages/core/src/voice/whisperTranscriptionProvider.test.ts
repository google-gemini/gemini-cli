/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhisperTranscriptionProvider } from './whisperTranscriptionProvider.js';
import commandExists from 'command-exists';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

vi.mock('command-exists', () => ({
  default: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('WhisperTranscriptionProvider', () => {
  function createMockProcess() {
    const process = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    }) as unknown as ChildProcessWithoutNullStreams;
    vi.mocked(spawn).mockReturnValue(process);
    return process;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commandExists).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw a friendly error if whisper-stream is not available', async () => {
    vi.mocked(commandExists).mockRejectedValue(new Error('not found'));

    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });

    await expect(provider.connect()).rejects.toThrow(
      'The `whisper-stream` command is required for local voice mode. Please install it (e.g., `brew install whisper-cpp` on macOS).',
    );
  });

  it('should resolve only after whisper-stream reports readiness', async () => {
    vi.useFakeTimers();
    const process = createMockProcess();
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    let connected = false;

    const connection = provider.connect().then(() => {
      connected = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(connected).toBe(false);

    process.stderr.emit(
      'data',
      Buffer.from('main: processing, press Ctrl+C to stop'),
    );
    await connection;
    expect(connected).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('should reject if whisper-stream closes before becoming ready', async () => {
    const process = createMockProcess();
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const connection = provider.connect();
    await vi.waitUntil(() => vi.mocked(spawn).mock.calls.length > 0);

    process.emit('close', 1);

    await expect(connection).rejects.toThrow(
      'whisper-stream exited before becoming ready (code 1)',
    );
  });

  it('should reject process errors before readiness', async () => {
    const process = createMockProcess();
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const emittedError = vi.fn();
    provider.on('error', emittedError);
    const connection = provider.connect();
    await vi.waitUntil(() => vi.mocked(spawn).mock.calls.length > 0);
    const error = new Error('spawn failed');

    process.emit('error', error);

    await expect(connection).rejects.toBe(error);
    expect(emittedError).toHaveBeenCalledWith(error);
  });

  it('should reject and stop whisper-stream when readiness times out', async () => {
    vi.useFakeTimers();
    const process = createMockProcess();
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const connection = provider.connect();
    const connectionError = connection.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(await connectionError).toEqual(
      expect.objectContaining({
        message: 'whisper-stream did not become ready within 10 seconds',
      }),
    );
    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
