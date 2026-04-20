/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Barrel exports for the voice interaction module.
 */

// Core types and enums
export { VoiceEvent, VoiceState, DEFAULT_VOICE_CONFIG } from './types.js';
export type {
  AudioChunk,
  TranscriptResult,
  VoiceCommand,
  VoiceConfig,
  STTProvider,
  TTSProvider,
} from './types.js';

// Audio capture
export { AudioCapture } from './audioCapture.js';
export type {
  AudioCaptureOptions,
  AudioCaptureEvents,
} from './audioCapture.js';

// Voice activity detection
export { VoiceActivityDetector } from './voiceActivityDetector.js';
export type { VADOptions } from './voiceActivityDetector.js';

// Wake word detection
export { WakeWordDetector } from './wakeWordDetector.js';
export type { WakeWordDetectorOptions } from './wakeWordDetector.js';

// Voice command parsing
export {
  parseVoiceCommand,
  getRecognizedPhrases,
} from './voiceCommandParser.js';

// Voice session orchestrator
export { VoiceSession } from './voiceSession.js';
export type { VoiceSessionOptions } from './voiceSession.js';

// STT providers
export { ExternalSTTProvider } from './sttProviders/externalSTTProvider.js';
export type { ExternalSTTOptions } from './sttProviders/externalSTTProvider.js';
export { WebSpeechProvider } from './sttProviders/webSpeechProvider.js';

// TTS providers
export { SystemTTSProvider } from './ttsProviders/systemTTSProvider.js';
export type { SystemTTSOptions } from './ttsProviders/systemTTSProvider.js';
export { ExternalTTSProvider } from './ttsProviders/externalTTSProvider.js';
export type { ExternalTTSOptions } from './ttsProviders/externalTTSProvider.js';
