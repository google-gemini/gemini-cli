/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { VadDetector } from './vadDetector.js';

/** Build a 16-bit LE PCM buffer with a constant amplitude (0–1). */
function makePcm(samples: number, amplitude: number): Buffer {
  const buf = Buffer.allocUnsafe(samples * 2);
  const value = Math.round(amplitude * 32767);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(value, i * 2);
  }
  return buf;
}

describe('VadDetector', () => {
  it('emits speechStart after enough loud frames', () => {
    const vad = new VadDetector({ speechOnsetFrames: 2, energyThreshold: 0.1 });
    const onStart = vi.fn();
    vad.on('speechStart', onStart);

    // One frame of loud audio — not enough yet
    vad.process(makePcm(160, 0.5));
    expect(onStart).not.toHaveBeenCalled();

    // Second frame — should fire
    vad.process(makePcm(160, 0.5));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('does not emit speechStart for quiet audio', () => {
    const vad = new VadDetector({ energyThreshold: 0.1 });
    const onStart = vi.fn();
    vad.on('speechStart', onStart);

    for (let i = 0; i < 10; i++) {
      vad.process(makePcm(160, 0.01));
    }
    expect(onStart).not.toHaveBeenCalled();
  });

  it('emits speechEnd after silence offset', () => {
    const vad = new VadDetector({
      speechOnsetFrames: 1,
      silenceOffsetFrames: 2,
      energyThreshold: 0.1,
    });
    const onEnd = vi.fn();
    vad.on('speechEnd', onEnd);

    vad.process(makePcm(160, 0.5)); // trigger speechStart
    vad.process(makePcm(160, 0.0)); // silence frame 1
    expect(onEnd).not.toHaveBeenCalled();
    vad.process(makePcm(160, 0.0)); // silence frame 2 — fires
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('does not emit speechEnd before silence offset is reached', () => {
    const vad = new VadDetector({
      speechOnsetFrames: 1,
      silenceOffsetFrames: 5,
      energyThreshold: 0.1,
    });
    const onEnd = vi.fn();
    vad.on('speechEnd', onEnd);

    vad.process(makePcm(160, 0.5));
    for (let i = 0; i < 4; i++) {
      vad.process(makePcm(160, 0.0));
    }
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('handles buffers smaller than one frame', () => {
    const vad = new VadDetector({ speechOnsetFrames: 1, energyThreshold: 0.1 });
    const onStart = vi.fn();
    vad.on('speechStart', onStart);

    // 80 samples = half a frame (160 samples), split across two calls
    vad.process(makePcm(80, 0.5));
    expect(onStart).not.toHaveBeenCalled();
    vad.process(makePcm(80, 0.5));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('resets state correctly', () => {
    const vad = new VadDetector({ speechOnsetFrames: 1, energyThreshold: 0.1 });
    const onStart = vi.fn();
    vad.on('speechStart', onStart);

    vad.process(makePcm(160, 0.5));
    expect(vad.speaking).toBe(true);

    vad.reset();
    expect(vad.speaking).toBe(false);
  });

  it('speechStart fires only once per speech segment', () => {
    const vad = new VadDetector({ speechOnsetFrames: 1, energyThreshold: 0.1 });
    const onStart = vi.fn();
    vad.on('speechStart', onStart);

    for (let i = 0; i < 5; i++) {
      vad.process(makePcm(160, 0.5));
    }
    expect(onStart).toHaveBeenCalledOnce();
  });
});
