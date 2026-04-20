/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceActivityDetector } from '../voiceActivityDetector.js';
import type { AudioChunk } from '../types.js';

/**
 * Creates an AudioChunk containing 16-bit PCM samples at the given
 * amplitude level (0-1). Each sample is written as a signed 16-bit
 * little-endian value.
 */
function createChunk(amplitude: number, numSamples = 160): AudioChunk {
  const buffer = Buffer.alloc(numSamples * 2);
  const sampleValue = Math.round(amplitude * 32767);
  for (let i = 0; i < numSamples; i++) {
    buffer.writeInt16LE(sampleValue, i * 2);
  }
  return {
    data: buffer,
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
  };
}

/** Creates a silent (zero-amplitude) audio chunk. */
function silentChunk(numSamples = 160): AudioChunk {
  return createChunk(0, numSamples);
}

describe('VoiceActivityDetector', () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    vad = new VoiceActivityDetector({
      speechThresholdMultiplier: 3.0,
      silenceDurationMs: 200, // Short for testing.
      initialNoiseFloor: 0.01,
    });
  });

  it('should classify a silent chunk as non-speech', () => {
    const result = vad.processChunk(silentChunk());
    expect(result).toBe(false);
    expect(vad.speechActive).toBe(false);
  });

  it('should classify a loud chunk as speech', () => {
    const result = vad.processChunk(createChunk(0.8));
    expect(result).toBe(true);
    expect(vad.speechActive).toBe(true);
  });

  it('should invoke onSpeechStart when speech begins', () => {
    const handler = vi.fn();
    vad.onSpeechStart(handler);

    vad.processChunk(silentChunk());
    expect(handler).not.toHaveBeenCalled();

    vad.processChunk(createChunk(0.8));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should invoke onSpeechEnd after sustained silence', () => {
    const handler = vi.fn();
    vad.onSpeechEnd(handler);

    // Start speech.
    vad.processChunk(createChunk(0.8));
    expect(vad.speechActive).toBe(true);

    // Simulate silence with time advancement.
    vi.useFakeTimers();
    vad.processChunk(silentChunk());
    expect(handler).not.toHaveBeenCalled();

    // Advance past the silence duration threshold.
    vi.advanceTimersByTime(300);
    vad.processChunk(silentChunk());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(vad.speechActive).toBe(false);

    vi.useRealTimers();
  });

  it('should not fire onSpeechStart again without an intervening end', () => {
    const handler = vi.fn();
    vad.onSpeechStart(handler);

    vad.processChunk(createChunk(0.8));
    vad.processChunk(createChunk(0.7));
    vad.processChunk(createChunk(0.9));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should reset internal state', () => {
    vad.processChunk(createChunk(0.8));
    expect(vad.speechActive).toBe(true);

    vad.reset();
    expect(vad.speechActive).toBe(false);
  });

  it('should return an empty chunk as non-speech', () => {
    const emptyChunk: AudioChunk = {
      data: Buffer.alloc(0),
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
    };
    const result = vad.processChunk(emptyChunk);
    expect(result).toBe(false);
  });

  it('should adapt the noise floor over time', () => {
    const initialFloor = vad.getNoiseFloor();

    // Feed several silent chunks to let the noise floor adapt.
    for (let i = 0; i < 20; i++) {
      vad.processChunk(silentChunk());
    }

    // The noise floor should decrease toward zero with silent input.
    expect(vad.getNoiseFloor()).toBeLessThanOrEqual(initialFloor);
  });
});
