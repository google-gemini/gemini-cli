/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceActivityDetector, computeRms } from './vad.js';
import {
  startVoiceStream,
  type MicrophoneProvider,
} from './microphoneStream.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  };
});

/** Create a 16-bit LE PCM buffer with a constant amplitude. */
function makePcmBuffer(amplitude: number, sampleCount = 160): Buffer {
  const buf = Buffer.alloc(sampleCount * 2);
  // Clamp to int16 range
  const value = Math.round(Math.max(-32768, Math.min(32767, amplitude)));
  for (let i = 0; i < sampleCount; i++) {
    buf.writeInt16LE(value, i * 2);
  }
  return buf;
}

// ── computeRms ──────────────────────────────────────────────

describe('computeRms', () => {
  it('should return 0 for an empty buffer', () => {
    expect(computeRms(Buffer.alloc(0))).toBe(0);
  });

  it('should return 0 for silent audio', () => {
    expect(computeRms(makePcmBuffer(0))).toBe(0);
  });

  it('should return ~1 for max amplitude', () => {
    const rms = computeRms(makePcmBuffer(32767));
    expect(rms).toBeGreaterThan(0.99);
    expect(rms).toBeLessThanOrEqual(1);
  });

  it('should scale proportionally with amplitude', () => {
    const low = computeRms(makePcmBuffer(1000));
    const high = computeRms(makePcmBuffer(10000));
    expect(high).toBeGreaterThan(low);
  });
});

// ── VoiceActivityDetector ───────────────────────────────────

describe('VoiceActivityDetector', () => {
  let onStart: ReturnType<typeof vi.fn>;
  let onEnd: ReturnType<typeof vi.fn>;
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    onStart = vi.fn();
    onEnd = vi.fn();
    vad = new VoiceActivityDetector(
      { onSpeechStart: onStart, onSpeechEnd: onEnd },
      { energyThreshold: 0.02, silenceFrames: 3 },
    );
  });

  it('should detect speech when energy exceeds threshold', () => {
    vad.processFrame(makePcmBuffer(5000)); // ~0.15 RMS
    expect(vad.isSpeechActive).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('should not trigger on silence', () => {
    vad.processFrame(makePcmBuffer(0));
    expect(vad.isSpeechActive).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('should fire onSpeechStart only once per utterance', () => {
    vad.processFrame(makePcmBuffer(5000));
    vad.processFrame(makePcmBuffer(5000));
    vad.processFrame(makePcmBuffer(5000));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('should detect end of speech after enough silent frames', () => {
    // Start speech
    vad.processFrame(makePcmBuffer(5000));
    expect(vad.isSpeechActive).toBe(true);

    // 3 silent frames (matches silenceFrames config)
    vad.processFrame(makePcmBuffer(0));
    vad.processFrame(makePcmBuffer(0));
    vad.processFrame(makePcmBuffer(0));

    expect(vad.isSpeechActive).toBe(false);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('should not end speech before silence threshold', () => {
    vad.processFrame(makePcmBuffer(5000));
    vad.processFrame(makePcmBuffer(0)); // 1 silent frame
    vad.processFrame(makePcmBuffer(0)); // 2 silent frames
    // Not yet at 3 — speech should still be active
    expect(vad.isSpeechActive).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('should reset silence counter when speech resumes', () => {
    vad.processFrame(makePcmBuffer(5000)); // speech
    vad.processFrame(makePcmBuffer(0)); // 1 silent
    vad.processFrame(makePcmBuffer(0)); // 2 silent
    vad.processFrame(makePcmBuffer(5000)); // speech resumes — reset counter
    vad.processFrame(makePcmBuffer(0)); // 1 silent again
    expect(vad.isSpeechActive).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('should reset state', () => {
    vad.processFrame(makePcmBuffer(5000));
    expect(vad.isSpeechActive).toBe(true);
    vad.reset();
    expect(vad.isSpeechActive).toBe(false);
  });
});

// ── startVoiceStream ────────────────────────────────────────

describe('startVoiceStream', () => {
  it('should forward frames only during speech', () => {
    const frames: Buffer[] = [];
    let chunkCallback: ((samples: Buffer) => void) | undefined;

    const mic: MicrophoneProvider = {
      start: (cb) => {
        chunkCallback = cb;
      },
      stop: vi.fn(),
    };

    startVoiceStream(
      mic,
      { onAudioFrame: (f) => frames.push(f.samples) },
      { vad: { energyThreshold: 0.02, silenceFrames: 3 } },
    );

    // Silent frame — should NOT be forwarded
    chunkCallback!(makePcmBuffer(0));
    expect(frames).toHaveLength(0);

    // Speech frame — should be forwarded
    chunkCallback!(makePcmBuffer(5000));
    expect(frames).toHaveLength(1);
  });

  it('should call lifecycle callbacks', () => {
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    let chunkCallback: ((samples: Buffer) => void) | undefined;

    const mic: MicrophoneProvider = {
      start: (cb) => {
        chunkCallback = cb;
      },
      stop: vi.fn(),
    };

    startVoiceStream(
      mic,
      { onSpeechStart, onSpeechEnd },
      { vad: { energyThreshold: 0.02, silenceFrames: 2 } },
    );

    // Speech starts
    chunkCallback!(makePcmBuffer(5000));
    expect(onSpeechStart).toHaveBeenCalledOnce();

    // Silence ends speech
    chunkCallback!(makePcmBuffer(0));
    chunkCallback!(makePcmBuffer(0));
    expect(onSpeechEnd).toHaveBeenCalledOnce();
  });

  it('should stop the microphone when teardown is called', () => {
    const mic: MicrophoneProvider = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    const stop = startVoiceStream(mic, {});
    stop();
    expect(mic.stop).toHaveBeenCalledOnce();
  });
});
