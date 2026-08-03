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

  async function connectProvider() {
    const process = createMockProcess();
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const connection = provider.connect();
    await vi.advanceTimersByTimeAsync(0);
    process.stderr.emit(
      'data',
      Buffer.from('main: processing, press Ctrl+C to stop'),
    );
    await connection;
    return { process, provider };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
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

  it('should preserve a timestamped record split across stdout chunks', async () => {
    const { process, provider } = await connectProvider();
    const transcription = vi.fn();
    provider.on('transcription', transcription);

    process.stdout.emit('data', Buffer.from('[00:00:00.000 --> 00:00:'));
    expect(transcription).not.toHaveBeenCalled();

    process.stdout.emit('data', Buffer.from('02.000] Hello world.\n'));

    expect(transcription).toHaveBeenCalledOnce();
    expect(transcription).toHaveBeenCalledWith('Hello world.');
    expect(provider.getTranscription()).toBe('Hello world.');
  });

  it('should preserve transcribed text split across stdout chunks', async () => {
    const { process, provider } = await connectProvider();
    const transcription = vi.fn();
    provider.on('transcription', transcription);

    process.stdout.emit(
      'data',
      Buffer.from('[00:00:00.000 --> 00:00:02.000] Hello'),
    );
    process.stdout.emit('data', Buffer.from(' world.\n'));

    expect(transcription).toHaveBeenCalledWith('Hello world.');
  });

  it('should parse complete records while buffering the final partial record', async () => {
    const { process, provider } = await connectProvider();
    const transcription = vi.fn();
    provider.on('transcription', transcription);

    process.stdout.emit(
      'data',
      Buffer.from(
        '[00:00:00.000 --> 00:00:01.000] First.\n[00:00:01.000 --> 00:00:02.000] Sec',
      ),
    );
    expect(transcription).toHaveBeenLastCalledWith('First.');

    process.stdout.emit('data', Buffer.from('ond.\n'));

    expect(transcription).toHaveBeenLastCalledWith('First. Second.');
    expect(transcription).toHaveBeenCalledTimes(2);
  });

  it('should preserve UTF-8 characters split across byte chunks', async () => {
    const { process, provider } = await connectProvider();
    const transcription = vi.fn();
    provider.on('transcription', transcription);
    const output = Buffer.from(
      '[00:00:00.000 --> 00:00:02.000] Un café.\n',
      'utf8',
    );
    const splitAt = output.indexOf(Buffer.from('é')) + 1;

    process.stdout.emit('data', output.subarray(0, splitAt));
    process.stdout.emit('data', output.subarray(splitAt));

    expect(transcription).toHaveBeenCalledWith('Un café.');
  });

  it('should flush a final unterminated record when the process closes', async () => {
    const { process, provider } = await connectProvider();
    const transcription = vi.fn();
    provider.on('transcription', transcription);

    process.stdout.emit(
      'data',
      Buffer.from('[00:00:00.000 --> 00:00:02.000] Final words.'),
    );
    expect(transcription).not.toHaveBeenCalled();

    process.emit('close', 0);

    expect(transcription).toHaveBeenCalledWith('Final words.');
  });

  it('should ignore late data and close events from a replaced process', async () => {
    const firstProcess = createMockProcess();
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const transcription = vi.fn();
    const closed = vi.fn();
    provider.on('transcription', transcription);
    provider.on('close', closed);
    const firstConnection = provider.connect();
    await vi.advanceTimersByTimeAsync(0);
    firstProcess.stderr.emit('data', Buffer.from('main: processing'));
    await firstConnection;
    firstProcess.stdout.emit(
      'data',
      Buffer.from('[00:00:00.000 --> 00:00:01.000] Stale'),
    );

    provider.disconnect();
    const secondProcess = createMockProcess();
    const secondConnection = provider.connect();
    await vi.advanceTimersByTimeAsync(0);
    secondProcess.stderr.emit('data', Buffer.from('main: processing'));
    await secondConnection;

    firstProcess.stdout.emit('data', Buffer.from(' transcription.\n'));
    firstProcess.emit('close', 0);
    secondProcess.stdout.emit(
      'data',
      Buffer.from('[00:00:00.000 --> 00:00:01.000] Current.\n'),
    );

    expect(transcription).toHaveBeenCalledOnce();
    expect(transcription).toHaveBeenCalledWith('Current.');
    expect(closed).not.toHaveBeenCalled();

    provider.disconnect();
    expect(secondProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
