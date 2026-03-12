/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import { VoiceActivityDetector, type VadConfig } from './vad.js';

/** PCM audio frame yielded by the streaming microphone. */
export interface AudioFrame {
  /** Raw 16-bit LE PCM samples. */
  readonly samples: Buffer;
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  /** Number of channels (1 = mono). */
  readonly channels: number;
}

/** Callbacks for voice stream lifecycle events. */
export interface VoiceStreamCallbacks {
  onSpeechStart?: () => void;
  onAudioFrame?: (frame: AudioFrame) => void;
  onSpeechEnd?: () => void;
}

/** Options for {@link startVoiceStream}. */
export interface VoiceStreamOptions {
  /** VAD configuration overrides. */
  vad?: VadConfig;
  /** Sample rate in Hz (default: 16000). */
  sampleRate?: number;
  /** Audio channels (default: 1). */
  channels?: number;
}

/**
 * An AudioInputProvider that feeds frames into the voice stream.
 * Matches the existing AudioInputProvider contract from the voice types.
 * In production, this would wrap node-record-lpcm16 or a similar library.
 * For now, it's injected so tests can supply synthetic audio.
 */
export interface MicrophoneProvider {
  start(onChunk: (samples: Buffer) => void): void;
  stop(): void;
}

/**
 * Start a VAD-gated voice stream.
 *
 * Reads audio frames from the provided microphone source, runs each
 * through the energy-based VAD, and only emits frames while speech
 * is active. This is the main entry point for hands-free voice input.
 *
 * @param mic - Microphone provider that emits raw PCM buffers.
 * @param callbacks - Lifecycle callbacks for speech events.
 * @param options - VAD and audio configuration.
 * @returns A stop function to tear down the stream.
 *
 * @example
 * ```ts
 * const stop = startVoiceStream(micProvider, {
 *   onSpeechStart: () => console.log('🎤 Listening...'),
 *   onAudioFrame: (frame) => sendToTranscription(frame),
 *   onSpeechEnd: () => console.log('Done speaking'),
 * });
 *
 * // Later: stop();
 * ```
 *
 * Future integration: a real MicrophoneProvider using node-record-lpcm16
 * would be injected here. This PR intentionally avoids that dependency.
 */
export function startVoiceStream(
  mic: MicrophoneProvider,
  callbacks: VoiceStreamCallbacks,
  options: VoiceStreamOptions = {},
): () => void {
  const sampleRate = options.sampleRate ?? 16000;
  const channels = options.channels ?? 1;

  const vad = new VoiceActivityDetector(
    {
      onSpeechStart: () => {
        debugLogger.log('[VAD] streaming audio');
        callbacks.onSpeechStart?.();
      },
      onSpeechEnd: () => {
        callbacks.onSpeechEnd?.();
      },
    },
    options.vad,
  );

  mic.start((samples: Buffer) => {
    vad.processFrame(samples);

    // Only forward frames while speech is active.
    if (vad.isSpeechActive) {
      const frame: AudioFrame = { samples, sampleRate, channels };
      callbacks.onAudioFrame?.(frame);
    }
  });

  // Return a teardown function.
  return () => {
    mic.stop();
    vad.reset();
    debugLogger.log('[VAD] stream stopped');
  };
}
