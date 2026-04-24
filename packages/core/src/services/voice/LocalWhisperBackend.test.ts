/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalWhisperBackend } from './LocalWhisperBackend.js';

const { mockReadFile, mockStat, mockRm, mockEmitVoiceTranscript } = vi.hoisted(
  () => ({
    mockReadFile: vi.fn(),
    mockStat: vi.fn(),
    mockRm: vi.fn(),
    mockEmitVoiceTranscript: vi.fn(),
  }),
);

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(),
  readFile: mockReadFile,
  rm: mockRm,
  stat: mockStat,
}));

vi.mock('../../utils/events.js', () => ({
  coreEvents: {
    emitVoiceTranscript: mockEmitVoiceTranscript,
  },
}));

function createRecordingProcessMock() {
  const registerCloseHandler = vi.fn((event: string, callback: () => void) => {
    if (event === 'close') {
      callback();
    }
  });

  return {
    kill: vi.fn(),
    on: registerCloseHandler,
    once: registerCloseHandler,
  };
}

function createWavBuffer(samples: number[]): Buffer {
  const pcmBuffer = Buffer.alloc(samples.length * 2);
  for (const [index, sample] of samples.entries()) {
    pcmBuffer.writeInt16LE(sample, index * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcmBuffer.length + 36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

describe('LocalWhisperBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockResolvedValue({ size: 128 });
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips transcription for silent wav recordings when threshold is enabled', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new LocalWhisperBackend({
      onStateChange,
      silenceThreshold: 80,
    });
    const recordingProcess = createRecordingProcessMock();
    const transcribeSpy = vi
      .spyOn(backend as never, 'transcribe')
      .mockResolvedValue('should not be used');

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioFile: string }).audioFile =
      '/tmp/recording.wav';
    (backend as unknown as { tempDir: string }).tempDir = '/tmp/voice';
    mockReadFile.mockResolvedValue(createWavBuffer([0, 2, -1, 1]));

    await backend.stop();

    expect(transcribeSpy).not.toHaveBeenCalled();
    expect(mockEmitVoiceTranscript).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledWith({
      isRecording: false,
      isTranscribing: true,
      error: null,
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      isRecording: false,
      isTranscribing: false,
      error:
        'Audio discarded (too quiet). Try speaking louder or adjust threshold: /voice sensitivity',
    });
  });

  it('does not skip transcription when silence detection is disabled', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new LocalWhisperBackend({
      onStateChange,
      silenceThreshold: 0,
    });
    const recordingProcess = createRecordingProcessMock();
    const transcribeSpy = vi
      .spyOn(backend as never, 'transcribe')
      .mockResolvedValue('transcribed text');

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioFile: string }).audioFile =
      '/tmp/recording.wav';
    (backend as unknown as { tempDir: string }).tempDir = '/tmp/voice';
    mockReadFile.mockResolvedValue(createWavBuffer([0, 1, -1, 2]));

    await backend.stop();

    expect(transcribeSpy).toHaveBeenCalledWith('/tmp/recording.wav');
    expect(mockEmitVoiceTranscript).toHaveBeenCalledWith('transcribed text');
  });

  it('registers the close handler before killing the recorder', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new LocalWhisperBackend({
      onStateChange,
      silenceThreshold: 0,
    });

    let closeHandler: (() => void) | null = null;
    const recordingProcess = {
      kill: vi.fn(() => closeHandler?.()),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'close') {
          closeHandler = callback;
        }
      }),
    };

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioFile: string }).audioFile =
      '/tmp/recording.wav';
    (backend as unknown as { tempDir: string }).tempDir = '/tmp/voice';

    mockReadFile.mockResolvedValue(createWavBuffer([0, 1, -1, 2]));
    const transcribeSpy = vi
      .spyOn(backend as never, 'transcribe')
      .mockResolvedValue('transcribed text');

    await backend.stop();

    expect(recordingProcess.once).toHaveBeenCalledWith(
      'close',
      expect.any(Function),
    );
    expect(recordingProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(transcribeSpy).toHaveBeenCalledWith('/tmp/recording.wav');
  });

  it('repro: stop remains pending if the recorder never emits close', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new LocalWhisperBackend({
      onStateChange,
      silenceThreshold: 0,
    });

    const recordingProcess = {
      kill: vi.fn(),
      once: vi.fn(),
    };

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioFile: string }).audioFile =
      '/tmp/recording.wav';
    (backend as unknown as { tempDir: string }).tempDir = '/tmp/voice';

    let settled = false;
    void backend.stop().then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(recordingProcess.once).toHaveBeenCalledWith(
      'close',
      expect.any(Function),
    );
    expect(recordingProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(settled).toBe(false);
  });

  it('cancel resolves immediately even if the recorder never emits close', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new LocalWhisperBackend({
      onStateChange,
      silenceThreshold: 0,
    });

    const recordingProcess = {
      kill: vi.fn(),
      once: vi.fn(),
    };

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { tempDir: string }).tempDir = '/tmp/voice';

    let settled = false;
    void backend.cancel().then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(recordingProcess.once).toHaveBeenCalledWith(
      'close',
      expect.any(Function),
    );
    expect(recordingProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(settled).toBe(true);
  });
});
