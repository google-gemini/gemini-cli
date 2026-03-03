/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  FunctionCall,
  LiveServerMessage,
  PrebuiltVoiceConfig,
  SpeechConfig,
} from '@google/genai';

/**
 * Voice session lifecycle states.
 *
 * State machine:
 *   IDLE -> CONNECTING -> CONNECTED -> LISTENING <-> RESPONDING -> DISCONNECTING -> IDLE
 *                                          |                           ^
 *                                          +---------------------------+
 *   Any state -> ERROR -> IDLE (via disconnect)
 */
export enum VoiceSessionState {
  /** No active session. */
  IDLE = 'idle',
  /** WebSocket connection being established. */
  CONNECTING = 'connecting',
  /** Connected but not yet capturing audio. */
  CONNECTED = 'connected',
  /** Actively capturing user audio input. */
  LISTENING = 'listening',
  /** Model is generating a response (text or audio). */
  RESPONDING = 'responding',
  /** Session is being torn down. */
  DISCONNECTING = 'disconnecting',
  /** An error occurred; session may need reconnection. */
  ERROR = 'error',
}

/**
 * Response modality for voice sessions.
 * TEXT: Model responds with text only (to be rendered in terminal).
 * AUDIO: Model responds with audio (requires speaker output).
 */
export type VoiceResponseModality = 'text' | 'audio';

/**
 * Configuration for a voice mode session.
 */
export interface VoiceConfig {
  /** Gemini model to use for the Live API session. */
  model: string;
  /** System instruction for the voice session. */
  systemInstruction?: string;
  /** How the model should respond. Defaults to 'text'. */
  responseModality: VoiceResponseModality;
  /** Voice configuration for audio output. */
  voice?: PrebuiltVoiceConfig;
  /** Language code for speech recognition (e.g., 'en-US'). */
  languageCode?: string;
  /**
   * Whether to use server-side voice activity detection (VAD).
   * When true, the Gemini Live API handles turn detection automatically.
   * When false, the client must signal turn boundaries manually.
   * Defaults to true.
   */
  useServerVAD: boolean;
  /**
   * Audio input sample rate in Hz. Defaults to 16000 (16kHz).
   * The Gemini Live API expects 16-bit PCM at this rate.
   */
  inputSampleRate: number;
  /**
   * Audio output sample rate in Hz. Defaults to 24000 (24kHz).
   * The Gemini Live API returns audio at this rate.
   */
  outputSampleRate: number;
}

/**
 * Returns a VoiceConfig with sensible defaults.
 */
export function createDefaultVoiceConfig(
  overrides?: Partial<VoiceConfig>,
): VoiceConfig {
  return {
    model: 'gemini-live-2.5-flash-preview',
    responseModality: 'text',
    useServerVAD: true,
    inputSampleRate: 16000,
    outputSampleRate: 24000,
    ...overrides,
  };
}

/**
 * Events emitted by the VoiceService.
 */
export enum VoiceEvent {
  /** Session state changed. */
  STATE_CHANGED = 'state_changed',
  /** Transcription of user speech received. */
  INPUT_TRANSCRIPTION = 'input_transcription',
  /** Transcription of model speech received. */
  OUTPUT_TRANSCRIPTION = 'output_transcription',
  /** Model text response chunk received (for text modality). */
  TEXT_RESPONSE = 'text_response',
  /** Model audio response chunk received (for audio modality). */
  AUDIO_RESPONSE = 'audio_response',
  /** Model turn is complete. */
  TURN_COMPLETE = 'turn_complete',
  /** Model was interrupted by user (barge-in). */
  INTERRUPTED = 'interrupted',
  /** Model requested tool execution. */
  TOOL_CALL = 'tool_call',
  /** Model cancelled pending tool calls. */
  TOOL_CALL_CANCELLATION = 'tool_call_cancellation',
  /** An error occurred. */
  ERROR = 'error',
  /** Session is about to be disconnected by server. */
  GO_AWAY = 'go_away',
}

/**
 * Payload for STATE_CHANGED events.
 */
export interface StateChangedPayload {
  previousState: VoiceSessionState;
  currentState: VoiceSessionState;
}

/**
 * Payload for transcription events.
 */
export interface TranscriptionPayload {
  text: string;
}

/**
 * Payload for TEXT_RESPONSE events.
 */
export interface TextResponsePayload {
  text: string;
}

/**
 * Payload for AUDIO_RESPONSE events.
 */
export interface AudioResponsePayload {
  /** Base64-encoded PCM audio data. */
  data: string;
  mimeType: string;
}

/**
 * Payload for TOOL_CALL events.
 */
export interface ToolCallPayload {
  functionCalls: FunctionCall[];
}

/**
 * Payload for TOOL_CALL_CANCELLATION events.
 */
export interface ToolCallCancellationPayload {
  ids: string[];
}

/**
 * Payload for ERROR events.
 */
export interface ErrorPayload {
  error: Error;
  /** The raw server message that caused the error, if available. */
  rawMessage?: LiveServerMessage;
}

/**
 * Payload for GO_AWAY events.
 */
export interface GoAwayPayload {
  /** Time remaining before disconnect, if provided by server. */
  timeLeft?: string;
}

/**
 * Map of VoiceEvent to its payload type.
 */
export interface VoiceEventMap {
  [VoiceEvent.STATE_CHANGED]: StateChangedPayload;
  [VoiceEvent.INPUT_TRANSCRIPTION]: TranscriptionPayload;
  [VoiceEvent.OUTPUT_TRANSCRIPTION]: TranscriptionPayload;
  [VoiceEvent.TEXT_RESPONSE]: TextResponsePayload;
  [VoiceEvent.AUDIO_RESPONSE]: AudioResponsePayload;
  [VoiceEvent.TURN_COMPLETE]: undefined;
  [VoiceEvent.INTERRUPTED]: undefined;
  [VoiceEvent.TOOL_CALL]: ToolCallPayload;
  [VoiceEvent.TOOL_CALL_CANCELLATION]: ToolCallCancellationPayload;
  [VoiceEvent.ERROR]: ErrorPayload;
  [VoiceEvent.GO_AWAY]: GoAwayPayload;
}

/**
 * Builds a SpeechConfig from VoiceConfig for the Live API.
 */
export function buildSpeechConfig(config: VoiceConfig): SpeechConfig {
  const speechConfig: SpeechConfig = {};

  if (config.voice) {
    speechConfig.voiceConfig = {
      prebuiltVoiceConfig: config.voice,
    };
  }

  if (config.languageCode) {
    speechConfig.languageCode = config.languageCode;
  }

  return speechConfig;
}
