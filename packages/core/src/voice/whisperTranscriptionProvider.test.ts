/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperTranscriptionProvider } from './whisperTranscriptionProvider.js';
import commandExists from 'command-exists';

vi.mock('command-exists', () => ({
  default: vi.fn(),
}));

describe('WhisperTranscriptionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should parse a single complete stdout line', () => {
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const onTranscription = vi.fn();
    provider.on('transcription', onTranscription);

    provider.parseOutput('[00:00:00.000 --> 00:00:02.000]   Hello world.\n');

    expect(onTranscription).toHaveBeenCalledTimes(1);
    expect(onTranscription).toHaveBeenCalledWith('Hello world.');
    expect(provider.getTranscription()).toBe('Hello world.');
  });

  it('should correctly buffer and assemble lines split across multiple stdout chunks', () => {
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const onTranscription = vi.fn();
    provider.on('transcription', onTranscription);

    // Chunk 1: timestamp prefix split
    provider.parseOutput('[00:00:00.000 --> 00:00:');
    expect(onTranscription).not.toHaveBeenCalled();

    // Chunk 2: timestamp completion + message
    provider.parseOutput('02.000]   Hello world.\n');
    expect(onTranscription).toHaveBeenCalledTimes(1);
    expect(onTranscription).toHaveBeenCalledWith('Hello world.');
  });

  it('should correctly buffer text split across stdout chunks', () => {
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const onTranscription = vi.fn();
    provider.on('transcription', onTranscription);

    // Chunk 1: partial text without newline
    provider.parseOutput('[00:00:00.000 --> 00:00:02.000]   Hello ');
    expect(onTranscription).not.toHaveBeenCalled();

    // Chunk 2: remainder of text with newline
    provider.parseOutput('world!\n');
    expect(onTranscription).toHaveBeenCalledTimes(1);
    expect(onTranscription).toHaveBeenCalledWith('Hello world!');
  });

  it('should handle multiple lines in a single stdout chunk', () => {
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const onTranscription = vi.fn();
    provider.on('transcription', onTranscription);

    provider.parseOutput(
      '[00:00:00.000 --> 00:00:02.000]   First line.\n[00:00:02.000 --> 00:00:04.000]   Second line.\n',
    );

    expect(onTranscription).toHaveBeenCalledTimes(2);
    expect(onTranscription).toHaveBeenNthCalledWith(1, 'First line.');
    expect(onTranscription).toHaveBeenNthCalledWith(
      2,
      'First line. Second line.',
    );
    expect(provider.getTranscription()).toBe('First line. Second line.');
  });

  it('should flush incomplete line when isFinal is true', () => {
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const onTranscription = vi.fn();
    provider.on('transcription', onTranscription);

    // Output without trailing newline
    provider.parseOutput('[00:00:00.000 --> 00:00:02.000]   Final utterance');
    expect(onTranscription).not.toHaveBeenCalled();

    // Final flush on stream close
    provider.parseOutput('', true);
    expect(onTranscription).toHaveBeenCalledTimes(1);
    expect(onTranscription).toHaveBeenCalledWith('Final utterance');
    expect(provider.getTranscription()).toBe('Final utterance');
  });

  it('should filter out silence and bracketed annotations', () => {
    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });
    const onTranscription = vi.fn();
    provider.on('transcription', onTranscription);

    provider.parseOutput(
      '[00:00:00.000 --> 00:00:02.000]   [Silence]\n[00:00:02.000 --> 00:00:04.000]   [music] (laughter) Real speech.\n',
    );

    expect(onTranscription).toHaveBeenCalledTimes(1);
    expect(onTranscription).toHaveBeenCalledWith('Real speech.');
  });
});
