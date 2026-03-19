/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export interface VadConfig {
  /**
   * RMS energy threshold (0–1) above which a frame is considered "speech".
   * Default: 0.01 (roughly -40 dBFS for 16-bit PCM).
   */
  energyThreshold?: number;
  /**
   * Minimum number of consecutive speech frames before VAD fires "speechStart".
   * Default: 3 (~90ms at 10ms frame stride).
   */
  speechOnsetFrames?: number;
  /**
   * Number of consecutive silence frames before VAD fires "speechEnd".
   * Default: 20 (~600ms).
   */
  silenceOffsetFrames?: number;
  /** Frame size in PCM samples (16-bit LE, 16 kHz).  Default: 160 (10ms). */
  frameSamples?: number;
}

/**
 * Energy-based Voice Activity Detector.
 *
 * Accepts raw 16-bit LE PCM buffers at 16 kHz mono and emits
 * 'speechStart' / 'speechEnd' events when voice activity is detected.
 *
 * This is a lightweight, dependency-free implementation suitable for
 * push-to-talk and basic VAD modes.  For production-grade VAD the
 * VoiceSession can rely on Gemini's server-side automatic activity
 * detection instead.
 */
export class VadDetector extends EventEmitter {
  private readonly energyThreshold: number;
  private readonly speechOnsetFrames: number;
  private readonly silenceOffsetFrames: number;
  private readonly frameSamples: number;

  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;
  private isSpeaking = false;
  private remainder = Buffer.alloc(0);

  constructor(config: VadConfig = {}) {
    super();
    this.energyThreshold = config.energyThreshold ?? 0.01;
    this.speechOnsetFrames = config.speechOnsetFrames ?? 3;
    this.silenceOffsetFrames = config.silenceOffsetFrames ?? 20;
    this.frameSamples = config.frameSamples ?? 160;
  }

  /**
   * Process an arbitrary-length PCM buffer.
   * The detector maintains internal state across calls so callers can
   * pass mic chunks of any size.
   */
  process(pcm: Buffer): void {
    // Prepend any leftover bytes from the previous call
    const buf = Buffer.concat([this.remainder, pcm]);
    const frameBytes = this.frameSamples * 2; // 16-bit = 2 bytes/sample
    let offset = 0;

    while (offset + frameBytes <= buf.length) {
      const frame = buf.subarray(offset, offset + frameBytes);
      const energy = this._rms(frame);

      if (energy >= this.energyThreshold) {
        this.consecutiveSpeechFrames++;
        this.consecutiveSilenceFrames = 0;
        if (
          !this.isSpeaking &&
          this.consecutiveSpeechFrames >= this.speechOnsetFrames
        ) {
          this.isSpeaking = true;
          this.emit('speechStart');
        }
      } else {
        this.consecutiveSilenceFrames++;
        this.consecutiveSpeechFrames = 0;
        if (
          this.isSpeaking &&
          this.consecutiveSilenceFrames >= this.silenceOffsetFrames
        ) {
          this.isSpeaking = false;
          this.emit('speechEnd');
        }
      }

      offset += frameBytes;
    }

    // Keep leftover bytes for the next call
    this.remainder = buf.subarray(offset);
  }

  reset(): void {
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.isSpeaking = false;
    this.remainder = Buffer.alloc(0);
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** Root Mean Square energy of a 16-bit LE PCM frame, normalised to [0, 1]. */
  private _rms(frame: Buffer): number {
    let sumSq = 0;
    const samples = frame.length / 2;
    for (let i = 0; i < frame.length; i += 2) {
      const s = frame.readInt16LE(i) / 32768;
      sumSq += s * s;
    }
    return Math.sqrt(sumSq / samples);
  }
}
