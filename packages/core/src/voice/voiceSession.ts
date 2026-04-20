/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Voice session orchestrator.
 *
 * Ties together audio capture, voice activity detection, speech-to-text,
 * text-to-speech, wake word detection, and command parsing into a single
 * cohesive session with a state machine:
 *
 *   Idle -> Listening -> Processing -> Speaking -> Idle
 *
 * The session handles interruption: if the user speaks while TTS is
 * playing, the TTS output is stopped and the session returns to
 * listening mode.
 */

import { EventEmitter } from 'node:events';
import { VoiceState, VoiceEvent, DEFAULT_VOICE_CONFIG } from './types.js';
import type {
  VoiceConfig,
  STTProvider,
  TTSProvider,
  VoiceCommand,
  TranscriptResult,
} from './types.js';
import { AudioCapture } from './audioCapture.js';
import { VoiceActivityDetector } from './voiceActivityDetector.js';
import { WakeWordDetector } from './wakeWordDetector.js';
import { parseVoiceCommand } from './voiceCommandParser.js';

/** Options for creating a voice session. */
export interface VoiceSessionOptions {
  /** Voice configuration (merged with defaults). */
  config?: Partial<VoiceConfig>;
  /** The STT provider to use. */
  sttProvider: STTProvider;
  /** The TTS provider to use. */
  ttsProvider: TTSProvider;
  /** Whether wake word detection is required before accepting commands. */
  requireWakeWord?: boolean;
}

/**
 * Orchestrates a hands-free voice interaction session.
 *
 * Usage:
 * ```ts
 * const session = new VoiceSession({
 *   sttProvider: new ExternalSTTProvider({ command: 'whisper', args: [...] }),
 *   ttsProvider: new SystemTTSProvider(),
 * });
 *
 * session.onCommand((command) => {
 *   // Handle the voice command
 * });
 *
 * await session.start();
 * ```
 */
export class VoiceSession extends EventEmitter {
  private _state: VoiceState = VoiceState.Idle;
  private readonly config: VoiceConfig;
  private readonly audioCapture: AudioCapture;
  private readonly vad: VoiceActivityDetector;
  private readonly wakeWordDetector: WakeWordDetector;
  private readonly sttProvider: STTProvider;
  private readonly ttsProvider: TTSProvider;
  private readonly requireWakeWord: boolean;

  private commandHandler: ((command: VoiceCommand) => void) | null = null;
  private wakeWordActivated = false;
  private currentTranscript = '';

  constructor(options: VoiceSessionOptions) {
    super();

    this.config = { ...DEFAULT_VOICE_CONFIG, ...options.config };
    this.sttProvider = options.sttProvider;
    this.ttsProvider = options.ttsProvider;
    this.requireWakeWord = options.requireWakeWord ?? false;

    this.audioCapture = new AudioCapture({
      sampleRate: this.config.sampleRate,
      channels: 1,
      bitDepth: 16,
    });

    this.vad = new VoiceActivityDetector({
      silenceDurationMs: this.config.silenceThresholdMs,
    });

    this.wakeWordDetector = new WakeWordDetector({
      wakeWords: [this.config.wakeWord],
    });

    this.setupEventHandlers();
  }

  /**
   * Wire up all internal event handlers.
   */
  private setupEventHandlers(): void {
    // Audio capture -> VAD + STT
    this.audioCapture.on('data', (chunk) => {
      this.vad.processChunk(chunk);
      this.sttProvider.feedAudio?.(chunk);
    });

    this.audioCapture.on('error', (err) => {
      this.emit(VoiceEvent.Error, err);
    });

    // VAD callbacks
    this.vad.onSpeechStart(() => {
      if (this._state === VoiceState.Speaking) {
        // User interrupted TTS -- stop speaking and go back to listening.
        void this.handleInterruption();
      }
      this.emit(VoiceEvent.SpeechStart);
    });

    this.vad.onSpeechEnd(() => {
      this.emit(VoiceEvent.SpeechEnd);
    });

    // STT transcript handling
    this.sttProvider.onTranscript((result: TranscriptResult) => {
      this.handleTranscript(result);
    });

    // TTS finish handling
    this.ttsProvider.onFinish(() => {
      this.emit(VoiceEvent.TTSEnd);
      this.transitionTo(VoiceState.Listening);
    });
  }

  /**
   * Handle an incoming STT transcript.
   */
  private handleTranscript(result: TranscriptResult): void {
    if (this.requireWakeWord && !this.wakeWordActivated) {
      // Check for wake word in the transcript.
      const detected = this.wakeWordDetector.processTranscript(result);
      if (detected) {
        this.wakeWordActivated = true;
        this.emit(VoiceEvent.WakeWordDetected, detected);

        // Extract any command that follows the wake word.
        const remaining = this.wakeWordDetector.stripWakeWord(result.text);
        if (remaining) {
          this.processCommand(remaining, result.text);
        }
      }
      return;
    }

    if (!result.isFinal) {
      // Accumulate partial results.
      this.currentTranscript = result.text;
      return;
    }

    // Final transcript -- process the command.
    const text = result.text || this.currentTranscript;
    this.currentTranscript = '';

    if (text.trim()) {
      this.emit(VoiceEvent.TranscriptReady, result);
      this.processCommand(text, text);
    }
  }

  /**
   * Parse the transcript into a command and invoke the handler.
   */
  private processCommand(text: string, originalTranscript: string): void {
    this.transitionTo(VoiceState.Processing);

    const command = parseVoiceCommand(text);
    // Preserve the original transcript even if parsing adjusted the text.
    command.originalTranscript = originalTranscript;

    this.commandHandler?.(command);

    // After processing, reset wake word requirement for next command.
    if (this.requireWakeWord) {
      this.wakeWordActivated = false;
    }
  }

  /**
   * Handle user interruption during TTS playback.
   */
  private async handleInterruption(): Promise<void> {
    if (this._state === VoiceState.Speaking) {
      await this.ttsProvider.stop();
      this.transitionTo(VoiceState.Listening);
    }
  }

  /**
   * Transition to a new state and emit the appropriate events.
   */
  private transitionTo(newState: VoiceState): void {
    this._state = newState;
    this.emit('stateChange', newState);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Start the voice session: begin audio capture, VAD, and STT.
   */
  async start(): Promise<void> {
    if (this._state !== VoiceState.Idle) {
      return;
    }

    await this.sttProvider.start();
    this.audioCapture.start();
    this.transitionTo(VoiceState.Listening);
  }

  /**
   * Stop the voice session and clean up all resources.
   */
  async stop(): Promise<void> {
    this.audioCapture.stop();
    await this.sttProvider.stop();
    await this.ttsProvider.stop();
    this.vad.reset();
    this.wakeWordDetector.reset();
    this.wakeWordActivated = false;
    this.currentTranscript = '';
    this.transitionTo(VoiceState.Idle);
  }

  /**
   * Speak text through the TTS provider.
   */
  async speak(text: string): Promise<void> {
    this.transitionTo(VoiceState.Speaking);
    this.emit(VoiceEvent.TTSStart);

    try {
      await this.ttsProvider.speak(text);
    } catch {
      // If TTS fails, return to listening.
      this.transitionTo(VoiceState.Listening);
    }
  }

  /**
   * Register a callback for when a voice command is recognized.
   */
  onCommand(handler: (command: VoiceCommand) => void): void {
    this.commandHandler = handler;
  }

  /** The current state of the voice session. */
  get state(): VoiceState {
    return this._state;
  }

  /** The current audio level (0-1) from the microphone. */
  getAudioLevel(): number {
    return this.audioCapture.getLevel();
  }

  /** The resolved voice configuration. */
  getConfig(): Readonly<VoiceConfig> {
    return this.config;
  }
}
