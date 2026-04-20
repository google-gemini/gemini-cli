/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core type definitions for the hands-free voice interaction mode.
 *
 * These types define the contracts for speech-to-text providers,
 * text-to-speech providers, voice activity detection, and the
 * overall voice session orchestration.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Events emitted during a voice session lifecycle. */
export enum VoiceEvent {
  WakeWordDetected = 'wake_word_detected',
  SpeechStart = 'speech_start',
  SpeechEnd = 'speech_end',
  TranscriptReady = 'transcript_ready',
  TTSStart = 'tts_start',
  TTSEnd = 'tts_end',
  Error = 'error',
}

/** The current state of the voice session state machine. */
export enum VoiceState {
  Idle = 'idle',
  Listening = 'listening',
  Processing = 'processing',
  Speaking = 'speaking',
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** A chunk of raw audio data captured from the microphone. */
export interface AudioChunk {
  /** Raw PCM audio data. */
  data: Buffer;
  /** Sample rate in Hz (e.g. 16000). */
  sampleRate: number;
  /** Number of audio channels (1 = mono, 2 = stereo). */
  channels: number;
  /** Bits per sample (e.g. 16). */
  bitDepth: number;
}

/** The result of a speech-to-text transcription. */
export interface TranscriptResult {
  /** The transcribed text. */
  text: string;
  /** Confidence score between 0 and 1. */
  confidence: number;
  /** Whether this is a final transcript (as opposed to an interim partial result). */
  isFinal: boolean;
  /** The detected or configured language code (e.g. "en-US"). */
  language: string;
}

/** A parsed voice command mapped from a spoken transcript. */
export interface VoiceCommand {
  /** The type of command: a slash command or a natural language prompt. */
  type: 'slash' | 'prompt';
  /** The slash command string (e.g. "/compress") or the raw prompt text. */
  value: string;
  /** The original spoken transcript that produced this command. */
  originalTranscript: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the voice session. */
export interface VoiceConfig {
  /** The speech-to-text provider to use (e.g. "external", "web"). */
  sttProvider: string;
  /** The text-to-speech provider to use (e.g. "system", "external"). */
  ttsProvider: string;
  /** Language code for recognition and synthesis (e.g. "en-US"). */
  language: string;
  /** The wake word phrase that activates listening (e.g. "Hey Gemini"). */
  wakeWord: string;
  /** Duration of silence (ms) before end-of-speech is detected. */
  silenceThresholdMs: number;
  /** Audio sample rate in Hz. */
  sampleRate: number;
}

/** Default voice configuration values. */
export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  sttProvider: 'external',
  ttsProvider: 'system',
  language: 'en-US',
  wakeWord: 'Hey Gemini',
  silenceThresholdMs: 1500,
  sampleRate: 16000,
};

// ---------------------------------------------------------------------------
// Provider interfaces
// ---------------------------------------------------------------------------

/** Interface for speech-to-text providers. */
export interface STTProvider {
  /** Start listening and transcribing audio. */
  start(): Promise<void>;

  /** Stop listening. */
  stop(): Promise<void>;

  /** Register a callback for transcript results. */
  onTranscript(handler: (result: TranscriptResult) => void): void;

  /** Whether the provider is currently listening. */
  isListening(): boolean;

  /** Feed an audio chunk to the provider for transcription. */
  feedAudio?(chunk: AudioChunk): void;
}

/** Interface for text-to-speech providers. */
export interface TTSProvider {
  /** Speak the given text aloud. Resolves when speech finishes or is stopped. */
  speak(text: string): Promise<void>;

  /** Stop any currently playing speech. */
  stop(): Promise<void>;

  /** Whether the provider is currently speaking. */
  isSpeaking(): boolean;

  /** Register a callback for when speech finishes. */
  onFinish(handler: () => void): void;
}
