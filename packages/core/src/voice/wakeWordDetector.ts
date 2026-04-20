/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple keyword-based wake word detector.
 *
 * Scans STT transcript text for configurable wake phrases
 * (e.g. "Hey Gemini", "OK Gemini"). Uses case-insensitive string
 * matching on the transcript -- no ML model is required.
 *
 * A cooldown period prevents rapid re-triggering after a detection.
 */

import type { TranscriptResult } from './types.js';

/** Configuration for the wake word detector. */
export interface WakeWordDetectorOptions {
  /**
   * List of wake phrases to listen for.
   * Defaults to ["Hey Gemini", "OK Gemini"].
   */
  wakeWords?: string[];

  /**
   * Cooldown period (ms) after a detection before the detector
   * can trigger again. Defaults to 3000ms.
   */
  cooldownMs?: number;
}

/**
 * Detects wake word phrases in STT transcripts.
 */
export class WakeWordDetector {
  private readonly wakeWords: string[];
  private readonly cooldownMs: number;
  private lastDetectionTime = 0;
  private detectionHandler: ((wakeWord: string) => void) | null = null;

  constructor(options: WakeWordDetectorOptions = {}) {
    this.wakeWords = (options.wakeWords ?? ['Hey Gemini', 'OK Gemini']).map(
      (w) => w.toLowerCase(),
    );
    this.cooldownMs = options.cooldownMs ?? 3000;
  }

  /**
   * Register a callback invoked when a wake word is detected.
   */
  onDetected(handler: (wakeWord: string) => void): void {
    this.detectionHandler = handler;
  }

  /**
   * Process a transcript result and check for wake words.
   *
   * @returns The detected wake word, or `null` if none was found.
   */
  processTranscript(transcript: TranscriptResult): string | null {
    const now = Date.now();

    // Enforce cooldown period.
    if (now - this.lastDetectionTime < this.cooldownMs) {
      return null;
    }

    const text = transcript.text.toLowerCase();

    for (const wakeWord of this.wakeWords) {
      if (text.includes(wakeWord)) {
        this.lastDetectionTime = now;
        this.detectionHandler?.(wakeWord);
        return wakeWord;
      }
    }

    return null;
  }

  /**
   * Strips the wake word from the beginning of a transcript, returning
   * the remaining text as the user's actual command.
   */
  stripWakeWord(text: string): string {
    const lowerText = text.toLowerCase();

    for (const wakeWord of this.wakeWords) {
      const index = lowerText.indexOf(wakeWord);
      if (index !== -1) {
        return text.slice(index + wakeWord.length).trim();
      }
    }

    return text;
  }

  /**
   * Reset the cooldown timer, allowing immediate re-detection.
   */
  reset(): void {
    this.lastDetectionTime = 0;
  }

  /**
   * Returns the list of configured wake words.
   */
  getWakeWords(): readonly string[] {
    return this.wakeWords;
  }
}
