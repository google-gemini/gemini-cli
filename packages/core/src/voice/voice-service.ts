/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GoogleGenAI,
  Session,
  FunctionResponse,
  FunctionDeclaration,
  LiveServerMessage,
} from '@google/genai';
import { Modality } from '@google/genai';
import { EventEmitter } from 'node:events';

import type {
  VoiceConfig,
  VoiceEventMap,
  AudioResponsePayload,
  TextResponsePayload,
} from './types.js';
import {
  VoiceSessionState,
  VoiceEvent,
  buildSpeechConfig,
  createDefaultVoiceConfig,
} from './types.js';

/**
 * Typed event emitter for voice events.
 */
interface TypedVoiceEmitter {
  on<K extends VoiceEvent>(
    event: K,
    listener: (payload: VoiceEventMap[K]) => void,
  ): this;
  off<K extends VoiceEvent>(
    event: K,
    listener: (payload: VoiceEventMap[K]) => void,
  ): this;
  emit<K extends VoiceEvent>(event: K, payload: VoiceEventMap[K]): boolean;
  removeAllListeners(event?: VoiceEvent): this;
}

/**
 * VoiceService manages a Gemini Live API WebSocket session for
 * real-time voice interaction.
 *
 * This service:
 * - Establishes and manages a bidirectional WebSocket connection via the
 *   Gemini Live API (`GoogleGenAI.live.connect()`)
 * - Handles audio input streaming (base64 PCM chunks)
 * - Processes server messages (text, audio, tool calls, transcriptions)
 * - Manages session lifecycle and state transitions
 * - Supports tool calling and response forwarding
 * - Supports barge-in (user interrupting model output)
 *
 * Architecture:
 *   The VoiceService is designed to be used alongside (not replacing) the
 *   existing GeminiClient text pipeline. When voice mode is active, user
 *   input flows through the Live API WebSocket instead of the HTTP-based
 *   generateContentStream. The existing tool registry is reused for
 *   function calling.
 */
export class VoiceService {
  private session: Session | null = null;
  private state: VoiceSessionState = VoiceSessionState.IDLE;
  private config: VoiceConfig;
  private readonly emitter: EventEmitter & TypedVoiceEmitter;

  /**
   * Creates a VoiceService instance.
   *
   * @param genai - The GoogleGenAI client instance (must have `live` property).
   * @param configOverrides - Optional partial config overrides.
   */
  constructor(
    private readonly genai: GoogleGenAI,
    configOverrides?: Partial<VoiceConfig>,
  ) {
    this.config = createDefaultVoiceConfig(configOverrides);
    this.emitter = new EventEmitter() as EventEmitter & TypedVoiceEmitter;
  }

  /**
   * Returns the current session state.
   */
  getState(): VoiceSessionState {
    return this.state;
  }

  /**
   * Returns the current voice configuration.
   */
  getConfig(): Readonly<VoiceConfig> {
    return this.config;
  }

  /**
   * Updates the voice configuration. Can only be called when IDLE.
   * @throws Error if session is active.
   */
  updateConfig(overrides: Partial<VoiceConfig>): void {
    if (this.state !== VoiceSessionState.IDLE) {
      throw new Error(
        'Cannot update voice config while session is active. Disconnect first.',
      );
    }
    this.config = { ...this.config, ...overrides };
  }

  /**
   * Registers an event listener.
   */
  on<K extends VoiceEvent>(
    event: K,
    listener: (payload: VoiceEventMap[K]) => void,
  ): this {
    this.emitter.on(event, listener);
    return this;
  }

  /**
   * Removes an event listener.
   */
  off<K extends VoiceEvent>(
    event: K,
    listener: (payload: VoiceEventMap[K]) => void,
  ): this {
    this.emitter.off(event, listener);
    return this;
  }

  /**
   * Removes all listeners for a specific event, or all events if none specified.
   */
  removeAllListeners(event?: VoiceEvent): this {
    if (event !== undefined) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  /**
   * Establishes a Live API WebSocket connection.
   *
   * @param tools - Optional function declarations for tool calling.
   * @throws Error if already connected or connecting.
   */
  async connect(tools?: FunctionDeclaration[]): Promise<void> {
    if (
      this.state !== VoiceSessionState.IDLE &&
      this.state !== VoiceSessionState.ERROR
    ) {
      throw new Error(
        `Cannot connect: session is in '${this.state}' state. ` +
          `Expected 'idle' or 'error'.`,
      );
    }

    this.transitionState(VoiceSessionState.CONNECTING);

    try {
      const responseModalities =
        this.config.responseModality === 'audio'
          ? [Modality.AUDIO]
          : [Modality.TEXT];

      this.session = await this.genai.live.connect({
        model: this.config.model,
        config: {
          responseModalities,
          systemInstruction: this.config.systemInstruction,
          tools: tools ? [{ functionDeclarations: tools }] : undefined,
          speechConfig: buildSpeechConfig(this.config),
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: !this.config.useServerVAD,
            },
          },
        },
        callbacks: {
          onopen: () => {
            this.transitionState(VoiceSessionState.CONNECTED);
          },
          onmessage: (message) => {
            this.handleServerMessage(message);
          },
          onerror: (errorEvent) => {
            const message =
              'message' in errorEvent && typeof errorEvent.message === 'string'
                ? errorEvent.message
                : String(errorEvent);
            this.handleError(new Error(message));
          },
          onclose: () => {
            this.handleClose();
          },
        },
      });
    } catch (error) {
      this.transitionState(VoiceSessionState.ERROR);
      this.emitter.emit(VoiceEvent.ERROR, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Disconnects the active Live API session.
   */
  async disconnect(): Promise<void> {
    if (
      this.state === VoiceSessionState.IDLE ||
      this.state === VoiceSessionState.DISCONNECTING
    ) {
      return;
    }

    this.transitionState(VoiceSessionState.DISCONNECTING);

    try {
      if (this.session) {
        this.session.close();
        this.session = null;
      }
    } finally {
      this.transitionState(VoiceSessionState.IDLE);
    }
  }

  /**
   * Sends a text message through the Live API session.
   * This is useful for typed input while in voice mode.
   *
   * @param text - The text to send.
   * @param turnComplete - Whether this completes the user's turn. Defaults to true.
   * @throws Error if not connected.
   */
  sendText(text: string, turnComplete = true): void {
    this.ensureConnected();
    if (!this.session) {
      throw new Error('Session is null despite being connected.');
    }
    this.session.sendClientContent({
      turns: text,
      turnComplete,
    });

    if (turnComplete) {
      this.transitionState(VoiceSessionState.RESPONDING);
    }
  }

  /**
   * Sends a chunk of audio data through the Live API session.
   *
   * @param base64Audio - Base64-encoded PCM audio data.
   * @param mimeType - MIME type of the audio (default: 'audio/pcm').
   * @throws Error if not connected.
   */
  sendAudio(base64Audio: string, mimeType = 'audio/pcm'): void {
    this.ensureConnected();
    if (!this.session) {
      throw new Error('Session is null despite being connected.');
    }

    // Transition to LISTENING if we're in CONNECTED state
    if (this.state === VoiceSessionState.CONNECTED) {
      this.transitionState(VoiceSessionState.LISTENING);
    }

    this.session.sendRealtimeInput({
      audio: {
        data: base64Audio,
        mimeType,
      },
    });
  }

  /**
   * Signals the end of the audio input stream.
   * Used when client-side VAD detects end of speech.
   *
   * @throws Error if not connected.
   */
  sendAudioStreamEnd(): void {
    this.ensureConnected();
    if (!this.session) {
      throw new Error('Session is null despite being connected.');
    }
    this.session.sendRealtimeInput({
      audioStreamEnd: true,
    });
  }

  /**
   * Sends tool execution results back to the Live API.
   *
   * @param functionResponses - Array of function responses from tool execution.
   * @throws Error if not connected.
   */
  sendToolResponse(functionResponses: FunctionResponse[]): void {
    this.ensureConnected();
    if (!this.session) {
      throw new Error('Session is null despite being connected.');
    }
    this.session.sendToolResponse({ functionResponses });
  }

  /**
   * Signals user interruption (barge-in).
   * Tells the server to stop current generation.
   *
   * @throws Error if not connected.
   */
  sendInterrupt(): void {
    this.ensureConnected();
    if (!this.session) {
      throw new Error('Session is null despite being connected.');
    }
    // Send an empty turn with turnComplete=false to signal interruption
    this.session.sendClientContent({
      turnComplete: false,
    });
  }

  /**
   * Whether the service has an active session.
   */
  isConnected(): boolean {
    return (
      this.session !== null &&
      this.state !== VoiceSessionState.IDLE &&
      this.state !== VoiceSessionState.DISCONNECTING &&
      this.state !== VoiceSessionState.ERROR
    );
  }

  // ── Private Methods ───────────────────────────────────────────

  /**
   * Handles incoming server messages from the Live API WebSocket.
   */
  private handleServerMessage(msg: LiveServerMessage): void {
    // Handle model content (text or audio chunks)
    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          const payload: TextResponsePayload = { text: part.text };
          this.emitter.emit(VoiceEvent.TEXT_RESPONSE, payload);
        }
        if (part.inlineData?.data && part.inlineData.mimeType) {
          const payload: AudioResponsePayload = {
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          };
          this.emitter.emit(VoiceEvent.AUDIO_RESPONSE, payload);
        }
      }
    }

    // Handle turn completion
    if (msg.serverContent?.turnComplete) {
      this.emitter.emit(VoiceEvent.TURN_COMPLETE, undefined);
      // Transition back to LISTENING after model finishes
      if (
        this.state === VoiceSessionState.RESPONDING ||
        this.state === VoiceSessionState.CONNECTED
      ) {
        this.transitionState(VoiceSessionState.LISTENING);
      }
    }

    // Handle interruption
    if (msg.serverContent?.interrupted) {
      this.emitter.emit(VoiceEvent.INTERRUPTED, undefined);
      this.transitionState(VoiceSessionState.LISTENING);
    }

    // Handle transcriptions
    if (
      typeof msg.serverContent?.inputTranscription?.text === 'string' &&
      msg.serverContent.inputTranscription.text.length > 0
    ) {
      this.emitter.emit(VoiceEvent.INPUT_TRANSCRIPTION, {
        text: msg.serverContent.inputTranscription.text,
      });
    }

    if (
      typeof msg.serverContent?.outputTranscription?.text === 'string' &&
      msg.serverContent.outputTranscription.text.length > 0
    ) {
      this.emitter.emit(VoiceEvent.OUTPUT_TRANSCRIPTION, {
        text: msg.serverContent.outputTranscription.text,
      });
    }

    // Handle tool calls
    if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0) {
      this.emitter.emit(VoiceEvent.TOOL_CALL, {
        functionCalls: msg.toolCall.functionCalls,
      });
    }

    // Handle tool call cancellations
    if (
      msg.toolCallCancellation?.ids &&
      msg.toolCallCancellation.ids.length > 0
    ) {
      this.emitter.emit(VoiceEvent.TOOL_CALL_CANCELLATION, {
        ids: msg.toolCallCancellation.ids,
      });
    }

    // Handle goAway
    if (msg.goAway) {
      this.emitter.emit(VoiceEvent.GO_AWAY, {
        timeLeft: msg.goAway.timeLeft,
      });
    }
  }

  /**
   * Handles WebSocket errors.
   */
  private handleError(error: Error): void {
    this.transitionState(VoiceSessionState.ERROR);
    this.emitter.emit(VoiceEvent.ERROR, { error });
  }

  /**
   * Handles WebSocket close.
   */
  private handleClose(): void {
    this.session = null;
    if (this.state !== VoiceSessionState.IDLE) {
      this.transitionState(VoiceSessionState.IDLE);
    }
  }

  /**
   * Transitions to a new state and emits STATE_CHANGED event.
   */
  private transitionState(newState: VoiceSessionState): void {
    const previousState = this.state;
    if (previousState === newState) {
      return;
    }
    this.state = newState;
    this.emitter.emit(VoiceEvent.STATE_CHANGED, {
      previousState,
      currentState: newState,
    });
  }

  /**
   * Throws if the service is not in a connected state.
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error(
        `Voice service is not connected (current state: '${this.state}'). ` +
          `Call connect() first.`,
      );
    }
  }
}
