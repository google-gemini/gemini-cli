/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WakeWordDetector } from '../wakeWordDetector.js';
import type { TranscriptResult } from '../types.js';

/** Helper to create a TranscriptResult. */
function transcript(text: string, isFinal = true): TranscriptResult {
  return {
    text,
    confidence: 0.9,
    isFinal,
    language: 'en-US',
  };
}

describe('WakeWordDetector', () => {
  let detector: WakeWordDetector;

  beforeEach(() => {
    detector = new WakeWordDetector({
      wakeWords: ['Hey Gemini', 'OK Gemini'],
      cooldownMs: 100, // Short cooldown for tests.
    });
  });

  describe('processTranscript', () => {
    it('should detect "Hey Gemini" in a transcript', () => {
      const result = detector.processTranscript(
        transcript('Hey Gemini, what time is it?'),
      );
      expect(result).toBe('hey gemini');
    });

    it('should detect "OK Gemini" in a transcript', () => {
      const result = detector.processTranscript(
        transcript('OK Gemini show me the tools'),
      );
      expect(result).toBe('ok gemini');
    });

    it('should be case-insensitive', () => {
      const result = detector.processTranscript(
        transcript('HEY GEMINI help me'),
      );
      expect(result).toBe('hey gemini');
    });

    it('should return null when no wake word is present', () => {
      const result = detector.processTranscript(
        transcript('What is the weather today?'),
      );
      expect(result).toBeNull();
    });

    it('should respect the cooldown period', () => {
      // First detection should succeed.
      const result1 = detector.processTranscript(
        transcript('Hey Gemini hello'),
      );
      expect(result1).toBe('hey gemini');

      // Immediate second detection should be blocked by cooldown.
      const result2 = detector.processTranscript(
        transcript('Hey Gemini again'),
      );
      expect(result2).toBeNull();
    });

    it('should allow detection after cooldown expires', () => {
      vi.useFakeTimers();

      const result1 = detector.processTranscript(
        transcript('Hey Gemini first'),
      );
      expect(result1).toBe('hey gemini');

      // Advance past the cooldown.
      vi.advanceTimersByTime(200);

      const result2 = detector.processTranscript(
        transcript('Hey Gemini second'),
      );
      expect(result2).toBe('hey gemini');

      vi.useRealTimers();
    });

    it('should invoke the onDetected handler', () => {
      const handler = vi.fn();
      detector.onDetected(handler);

      detector.processTranscript(transcript('Hey Gemini do something'));
      expect(handler).toHaveBeenCalledWith('hey gemini');
    });
  });

  describe('stripWakeWord', () => {
    it('should strip "Hey Gemini" from the beginning', () => {
      const result = detector.stripWakeWord('Hey Gemini show me the tools');
      expect(result).toBe('show me the tools');
    });

    it('should strip "OK Gemini" from the beginning', () => {
      const result = detector.stripWakeWord('OK Gemini what time is it');
      expect(result).toBe('what time is it');
    });

    it('should handle case-insensitive stripping', () => {
      const result = detector.stripWakeWord('hey gemini help me');
      expect(result).toBe('help me');
    });

    it('should return the original text if no wake word is found', () => {
      const result = detector.stripWakeWord('no wake word here');
      expect(result).toBe('no wake word here');
    });

    it('should handle the wake word at the end gracefully', () => {
      const result = detector.stripWakeWord('something Hey Gemini');
      expect(result).toBe('');
    });
  });

  describe('reset', () => {
    it('should clear the cooldown and allow immediate detection', () => {
      detector.processTranscript(transcript('Hey Gemini first'));

      // Still in cooldown -- detection should be blocked.
      const blocked = detector.processTranscript(
        transcript('Hey Gemini blocked'),
      );
      expect(blocked).toBeNull();

      // Reset clears the cooldown.
      detector.reset();

      const result = detector.processTranscript(
        transcript('Hey Gemini allowed'),
      );
      expect(result).toBe('hey gemini');
    });
  });

  describe('getWakeWords', () => {
    it('should return the configured wake words in lowercase', () => {
      const words = detector.getWakeWords();
      expect(words).toEqual(['hey gemini', 'ok gemini']);
    });
  });

  describe('custom wake words', () => {
    it('should support custom wake words', () => {
      const custom = new WakeWordDetector({
        wakeWords: ['Computer'],
        cooldownMs: 0,
      });

      const result = custom.processTranscript(
        transcript('Computer, open the pod bay doors'),
      );
      expect(result).toBe('computer');
    });
  });
});
