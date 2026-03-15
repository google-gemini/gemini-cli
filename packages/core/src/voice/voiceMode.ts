/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import {
  VoiceSession,
  type VoiceSessionConfig,
  type VoiceState,
} from './voiceSession.js';
import { VadDetector, type VadConfig } from './vadDetector.js';
import { AudioCapture, type AudioCaptureConfig } from './audioCapture.js';
import { TtsPlayer } from './ttsPlayer.js';

export type ActivationMode = 'vad' | 'push-to-talk';

export interface VoiceModeConfig {
  /** Gemini API key. */
  apiKey: string;
  /** Activation mode. Default: 'vad'. */
  activationMode?: ActivationMode;
  /** Live model name override. */
  model?: string;
  /** TTS voice name (Gemini prebuilt voice). Default: 'Aoede'. */
  voiceName?: string;
  /** System instruction forwarded to the Live session. */
  systemInstruction?: string;
  /** VAD configuration (used when activationMode === 'vad'). */
  vadConfig?: VadConfig;
  /** Audio capture configuration. */
  captureConfig?: AudioCaptureConfig;
  /** Callback fired when the voice state changes. */
  onStateChange?: (state: VoiceState) => void;
  /** Callback fired when a transcript line is available. */
  onTranscript?: (text: string, isUser: boolean) => void;
  /** Callback fired on errors. */
  onError?: (err: Error) => void;
}

/**
 * VoiceMode is the top-level orchestrator for hands-free voice interaction.
 *
 * It wires together:
 *  - AudioCapture  — microphone → raw PCM
 *  - VadDetector   — PCM → speechStart / speechEnd events
 *  - VoiceSession  — PCM → Gemini Live API → audio/text responses
 *  - TtsPlayer     — response PCM → speaker output
 *
 * Usage:
 * ```ts
 * const vm = new VoiceMode({ apiKey: '...', onTranscript: console.log });
 * await vm.start();
 * // ... user speaks, agent replies ...
 * await vm.stop();
 * ```
 */
export class VoiceMode extends EventEmitter {
  private readonly config: VoiceModeConfig;
  private session: VoiceSession | null = null;
  private capture: AudioCapture | null = null;
  private vad: VadDetector | null = null;
  private tts: TtsPlayer | null = null;
  private _active = false;
  private _pushToTalkActive = false;

  constructor(config: VoiceModeConfig) {
    super();
    this.config = config;
  }

  get active(): boolean {
    return this._active;
  }

  /** Start the voice mode session. */
  async start(): Promise<void> {
    if (this._active) return;
    this._active = true;

    // 1. Create and connect the Live API session
    const sessionConfig: VoiceSessionConfig = {
      apiKey: this.config.apiKey,
      model: this.config.model,
      voiceName: this.config.voiceName,
      systemInstruction: this.config.systemInstruction,
      onStateChange: (state) => {
        this.config.onStateChange?.(state);
        this.emit('stateChange', state);
      },
      onTranscript: (text, isUser) => {
        this.config.onTranscript?.(text, isUser);
        this.emit('transcript', text, isUser);
      },
      onAudioChunk: (pcm) => {
        // Stop capture while speaking to avoid echo
        if (this.config.activationMode === 'vad') {
          this.capture?.stop();
        }
        this.tts?.write(pcm);
      },
      onError: (err) => {
        this.config.onError?.(err);
        this.emit('error', err);
      },
    };

    this.session = new VoiceSession(sessionConfig);

    // Resume capture after TTS finishes
    this.tts = new TtsPlayer();
    this.tts.on('done', () => {
      if (this._active && this.config.activationMode === 'vad') {
        this.capture?.start();
      }
    });

    await this.session.connect();

    // 2. Set up audio capture
    this.capture = new AudioCapture(this.config.captureConfig);

    if (this.config.activationMode === 'push-to-talk') {
      // In PTT mode, audio is only streamed while _pushToTalkActive is true
      this.capture.on('data', (pcm: Buffer) => {
        if (this._pushToTalkActive) {
          this.session?.sendAudioChunk(pcm);
        }
      });
    } else {
      // VAD mode: always capture, gate on speech detection
      this.vad = new VadDetector(this.config.vadConfig);

      this.vad.on('speechStart', () => {
        this.tts?.stop(); // interrupt if speaking
        this.session?.interrupt();
        this.emit('speechStart');
      });

      this.vad.on('speechEnd', () => {
        this.session?.sendAudioStreamEnd();
        this.emit('speechEnd');
      });

      this.capture.on('data', (pcm: Buffer) => {
        this.vad?.process(pcm);
        if (this.vad?.speaking) {
          this.session?.sendAudioChunk(pcm);
        }
      });
    }

    this.capture.on('error', (err: Error) => {
      this.config.onError?.(err);
      this.emit('error', err);
    });

    this.capture.start();
  }

  /** Stop the voice mode session and release all resources. */
  async stop(): Promise<void> {
    if (!this._active) return;
    this._active = false;

    this.capture?.stop();
    this.capture = null;

    this.tts?.stop();
    this.tts = null;

    this.vad?.reset();
    this.vad = null;

    this.session?.close();
    this.session = null;

    this.emit('stopped');
  }

  /**
   * Push-to-talk: call with `true` to start streaming, `false` to stop.
   * Only relevant when activationMode === 'push-to-talk'.
   */
  setPushToTalk(active: boolean): void {
    if (this.config.activationMode !== 'push-to-talk') return;
    this._pushToTalkActive = active;
    if (!active) {
      this.session?.sendAudioStreamEnd();
    }
  }

  /**
   * Interrupt the current response (equivalent to speaking while the agent
   * is talking in VAD mode).
   */
  interrupt(): void {
    this.tts?.stop();
    this.session?.interrupt();
  }
}
