/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiRestBackend } from './GeminiRestBackend.js';

const { mockEmitVoiceTranscript } = vi.hoisted(() => ({
  mockEmitVoiceTranscript: vi.fn(),
}));

vi.mock('../../utils/events.js', () => ({
  coreEvents: {
    emitVoiceTranscript: mockEmitVoiceTranscript,
  },
}));

function createRecordingProcessMock(onClose: () => void) {
  let closeHandler: (() => void) | null = null;
  let stdoutDataHandler: ((chunk: Buffer) => void) | null = null;

  return {
    kill: vi.fn(() => closeHandler?.()),
    once: vi.fn((event: string, callback: () => void) => {
      if (event === 'close') {
        closeHandler = () => {
          onClose();
          callback();
        };
      }
    }),
    stdout: {
      on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
        if (event === 'data') {
          stdoutDataHandler = callback;
        }
      }),
    },
    emitStdoutData: (chunk: Buffer) => stdoutDataHandler?.(chunk),
  };
}

describe('GeminiRestBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for recorder close before reading buffered audio', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new GeminiRestBackend(
      {
        onStateChange,
        silenceThreshold: 0,
      },
      {
        getContentGenerator: vi.fn(),
      } as never,
    );

    const recordingProcess = createRecordingProcessMock(() => {
      (
        backend as unknown as {
          audioChunks: Buffer[];
        }
      ).audioChunks.push(Buffer.from([1, 0, 2, 0]));
    });

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioChunks: Buffer[] }).audioChunks = [];

    const transcribeSpy = vi
      .spyOn(backend as never, 'transcribe')
      .mockResolvedValue('hello world');

    await backend.stop();

    expect(recordingProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(transcribeSpy).toHaveBeenCalledOnce();
    expect(mockEmitVoiceTranscript).toHaveBeenCalledWith('hello world');
  });

  it('keeps the final flushed audio chunk that arrives after stop begins', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new GeminiRestBackend(
      {
        onStateChange,
        silenceThreshold: 0,
      },
      {
        getContentGenerator: vi.fn(),
      } as never,
    );

    const recordingProcess = createRecordingProcessMock(() => {
      recordingProcess.emitStdoutData(Buffer.from([3, 0, 4, 0]));
    });

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioChunks: Buffer[] }).audioChunks = [
      Buffer.from([1, 0, 2, 0]),
    ];

    const transcribeSpy = vi
      .spyOn(backend as never, 'transcribe')
      .mockResolvedValue('hello world');

    // Register the stdout listener the same way start() would.
    (
      recordingProcess.stdout.on as (
        event: string,
        callback: (chunk: Buffer) => void,
      ) => void
    )('data', (chunk: Buffer) => {
      (
        backend as unknown as {
          audioChunks: Buffer[];
        }
      ).audioChunks.push(chunk);
    });

    await backend.stop();

    expect(recordingProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(transcribeSpy).toHaveBeenCalledOnce();
    expect((transcribeSpy.mock.calls[0] as [Buffer])[0].subarray(44)).toEqual(
      Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]),
    );
  });

  it('repro: stop remains pending if the recorder never emits close', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new GeminiRestBackend(
      {
        onStateChange,
        silenceThreshold: 0,
      },
      {
        getContentGenerator: vi.fn(),
      } as never,
    );

    const recordingProcess = {
      kill: vi.fn(),
      once: vi.fn(),
    };

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;
    (backend as unknown as { audioChunks: Buffer[] }).audioChunks = [
      Buffer.from([1, 0]),
    ];

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

  it('cancel returns immediately even if the recorder never emits close', async () => {
    const onStateChange = vi.fn().mockResolvedValue(undefined);
    const backend = new GeminiRestBackend(
      {
        onStateChange,
        silenceThreshold: 0,
      },
      {
        getContentGenerator: vi.fn(),
      } as never,
    );

    const recordingProcess = {
      kill: vi.fn(),
      once: vi.fn(),
    };

    (backend as unknown as { recordingProcess: unknown }).recordingProcess =
      recordingProcess;

    await backend.cancel();

    expect(recordingProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(onStateChange).toHaveBeenCalledWith({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });
  });
});
