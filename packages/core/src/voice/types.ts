/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Contracts for the Hands-Free Voice Mode pipeline.
 *
 * Architecture:
 *   Mic → AudioInputProvider → SpeechToTextAdapter → [Gemini API] → TextToSpeechAdapter → Speaker
 *
 * Each interface is designed to be swappable — the initial implementation
 * will use no-op stubs, and real backends (native audio, WebSocket bridges,
 * MCP audio servers, Gemini Live API) can be plugged in later.
 */

/** PCM audio chunk emitted by an AudioInputProvider. */
export interface AudioChunk {
  /** Raw PCM sample data. */
  readonly samples: Buffer;
  /** Sample rate in Hz (e.g. 16000). */
  readonly sampleRate: number;
  /** Number of audio channels (1 = mono, 2 = stereo). */
  readonly channels: number;
}

/** Captures audio from a microphone or other input device. */
export interface AudioInputProvider {
  /** Begin capturing audio. Implementations should emit chunks via the callback. */
  start(onChunk: (chunk: AudioChunk) => void): Promise<void>;
  /** Stop capturing and release resources. */
  stop(): Promise<void>;
  /** Whether the provider is currently capturing. */
  isActive(): boolean;
}

/** Converts an audio chunk to text (speech-to-text). */
export interface SpeechToTextAdapter {
  /** Transcribe a single audio chunk. Returns the transcribed text. */
  transcribe(chunk: AudioChunk): Promise<string>;
}

/** Converts text to audible speech (text-to-speech). */
export interface TextToSpeechAdapter {
  /** Synthesize text into audio and play it back. Resolves when playback ends. */
  speak(text: string): Promise<void>;
  /** Interrupt any in-progress playback. */
  cancel(): Promise<void>;
}

/** Configuration for a voice session. */
export interface VoiceSessionConfig {
  /** Sample rate in Hz for audio capture (default: 16000). */
  sampleRate?: number;
  /** Locale/language code for STT/TTS (e.g. "en-US"). */
  locale?: string;
}

/** Lifecycle states for the voice mode controller. */
export enum VoiceState {
  Idle = 'idle',
  Listening = 'listening',
  Processing = 'processing',
  Speaking = 'speaking',
  Error = 'error',
}
