/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';

/**
 * Configuration for the energy-based voice activity detector.
 */
export interface VadConfig {
  /** RMS energy threshold to consider a frame as speech (0–1). Default: 0.02 */
  energyThreshold?: number;
  /** Consecutive silent frames before speech is considered ended. Default: 30 */
  silenceFrames?: number;
}

/** Events emitted by the VAD during audio processing. */
export interface VadCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
}

const DEFAULT_ENERGY_THRESHOLD = 0.02;
const DEFAULT_SILENCE_FRAMES = 30;

/**
 * Lightweight energy-based Voice Activity Detector.
 *
 * Computes the Root Mean Square (RMS) energy of each audio frame
 * (16-bit PCM, little-endian) and compares it against a threshold.
 * When energy exceeds the threshold, speech is considered active.
 * When energy drops below the threshold for a configurable number of
 * consecutive frames, speech is considered ended.
 *
 * This is intentionally simple — no ML models, no spectral analysis.
 * Sufficient for CLI experimentation with voice mode.
 */
export class VoiceActivityDetector {
  private readonly threshold: number;
  private readonly maxSilenceFrames: number;
  private readonly callbacks: VadCallbacks;

  private speechActive = false;
  private consecutiveSilent = 0;

  constructor(callbacks: VadCallbacks, config: VadConfig = {}) {
    this.threshold = config.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD;
    this.maxSilenceFrames = config.silenceFrames ?? DEFAULT_SILENCE_FRAMES;
    this.callbacks = callbacks;
  }

  /** Whether speech is currently detected. */
  get isSpeechActive(): boolean {
    return this.speechActive;
  }

  /**
   * Process a single audio frame. Call this for each chunk of PCM data.
   * @param samples - Raw 16-bit little-endian PCM buffer.
   */
  processFrame(samples: Buffer): void {
    const energy = computeRms(samples);

    if (energy >= this.threshold) {
      this.consecutiveSilent = 0;
      if (!this.speechActive) {
        this.speechActive = true;
        debugLogger.log('[VAD] speech detected');
        this.callbacks.onSpeechStart();
      }
    } else if (this.speechActive) {
      this.consecutiveSilent++;
      if (this.consecutiveSilent >= this.maxSilenceFrames) {
        this.speechActive = false;
        this.consecutiveSilent = 0;
        debugLogger.log('[VAD] silence detected');
        this.callbacks.onSpeechEnd();
      }
    }
  }

  /** Reset detector state (e.g. between utterances). */
  reset(): void {
    this.speechActive = false;
    this.consecutiveSilent = 0;
  }
}

/**
 * Compute the Root Mean Square energy of a 16-bit LE PCM buffer.
 * Returns a value in 0–1 range (normalized by max int16 amplitude).
 */
export function computeRms(samples: Buffer): number {
  const sampleCount = Math.floor(samples.length / 2);
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    // Read signed 16-bit little-endian sample, normalize to -1..1
    const sample = samples.readInt16LE(i * 2) / 32768;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
}
