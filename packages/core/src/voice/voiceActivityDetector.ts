/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple energy-based Voice Activity Detection (VAD).
 *
 * Uses RMS energy thresholding with an adaptive noise floor to
 * distinguish speech from silence. No machine-learning models are
 * required -- the algorithm works purely on signal energy:
 *
 * 1. Compute the RMS energy of each incoming audio chunk.
 * 2. Maintain a running estimate of the ambient noise floor.
 * 3. If the energy exceeds `noiseFloor * speechThresholdMultiplier`,
 *    mark the chunk as speech.
 * 4. Track silence duration to detect end-of-speech.
 */

import type { AudioChunk } from './types.js';

/** Configuration for the voice activity detector. */
export interface VADOptions {
  /**
   * Multiplier applied to the noise floor to produce the speech threshold.
   * Higher values require louder speech relative to background noise.
   * Defaults to 3.0.
   */
  speechThresholdMultiplier?: number;

  /**
   * Duration of continuous silence (ms) required to trigger an
   * end-of-speech event. Defaults to 1500ms.
   */
  silenceDurationMs?: number;

  /**
   * Smoothing factor for updating the noise floor estimate.
   * A value between 0 and 1; smaller values make the noise floor
   * adapt more slowly. Defaults to 0.05.
   */
  noiseFloorSmoothing?: number;

  /**
   * Initial noise floor energy estimate. Defaults to 0.01.
   */
  initialNoiseFloor?: number;
}

/**
 * Energy-based Voice Activity Detector.
 *
 * Call {@link processChunk} for each incoming audio chunk. Register
 * callbacks via {@link onSpeechStart} and {@link onSpeechEnd} to be
 * notified when speech begins and ends.
 */
export class VoiceActivityDetector {
  private readonly speechThresholdMultiplier: number;
  private readonly silenceDurationMs: number;
  private readonly noiseFloorSmoothing: number;

  private noiseFloor: number;
  private isSpeechActive = false;
  private silenceStartTime: number | null = null;

  private speechStartHandler: (() => void) | null = null;
  private speechEndHandler: (() => void) | null = null;

  constructor(options: VADOptions = {}) {
    this.speechThresholdMultiplier = options.speechThresholdMultiplier ?? 3.0;
    this.silenceDurationMs = options.silenceDurationMs ?? 1500;
    this.noiseFloorSmoothing = options.noiseFloorSmoothing ?? 0.05;
    this.noiseFloor = options.initialNoiseFloor ?? 0.01;
  }

  /**
   * Register a callback invoked when speech starts.
   */
  onSpeechStart(handler: () => void): void {
    this.speechStartHandler = handler;
  }

  /**
   * Register a callback invoked when speech ends (after sufficient silence).
   */
  onSpeechEnd(handler: () => void): void {
    this.speechEndHandler = handler;
  }

  /**
   * Process an audio chunk and determine if it contains speech.
   *
   * @returns `true` if the chunk is classified as speech, `false` otherwise.
   */
  processChunk(chunk: AudioChunk): boolean {
    const energy = this.computeEnergy(chunk);
    const threshold = this.noiseFloor * this.speechThresholdMultiplier;
    const isSpeech = energy > threshold;

    if (isSpeech) {
      // Update noise floor more slowly during speech to avoid
      // the floor creeping up to match speech energy.
      this.silenceStartTime = null;

      if (!this.isSpeechActive) {
        this.isSpeechActive = true;
        this.speechStartHandler?.();
      }
    } else {
      // Update the noise floor estimate during non-speech segments.
      this.noiseFloor =
        this.noiseFloor * (1 - this.noiseFloorSmoothing) +
        energy * this.noiseFloorSmoothing;

      if (this.isSpeechActive) {
        const now = Date.now();
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        } else if (now - this.silenceStartTime >= this.silenceDurationMs) {
          this.isSpeechActive = false;
          this.silenceStartTime = null;
          this.speechEndHandler?.();
        }
      }
    }

    return isSpeech;
  }

  /**
   * Reset the detector to its initial state.
   */
  reset(): void {
    this.isSpeechActive = false;
    this.silenceStartTime = null;
  }

  /**
   * Returns whether speech is currently detected.
   */
  get speechActive(): boolean {
    return this.isSpeechActive;
  }

  /**
   * Returns the current noise floor estimate.
   */
  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  /**
   * Computes the RMS energy of a PCM audio chunk, normalized to 0-1.
   */
  private computeEnergy(chunk: AudioChunk): number {
    const { data, bitDepth } = chunk;
    const bytesPerSample = bitDepth / 8;
    const numSamples = Math.floor(data.length / bytesPerSample);

    if (numSamples === 0) {
      return 0;
    }

    let sumSquares = 0;
    for (let i = 0; i < numSamples; i++) {
      const offset = i * bytesPerSample;
      const sample =
        bytesPerSample === 2 ? data.readInt16LE(offset) : data.readInt8(offset);
      const maxVal = bytesPerSample === 2 ? 32768 : 128;
      const normalized = sample / maxVal;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / numSamples);
  }
}
