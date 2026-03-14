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
