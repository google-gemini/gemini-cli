/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../utils/debugLogger.js';
import type {
  AudioInputProvider,
  SpeechToTextAdapter,
  TextToSpeechAdapter,
  VoiceSessionConfig,
} from './types.js';
import { VoiceState } from './types.js';

/**
 * Orchestrates the voice mode lifecycle.
 *
 * Wires together an AudioInputProvider, SpeechToTextAdapter, and
 * TextToSpeechAdapter into a coherent listen→transcribe→respond→speak loop.
 *
 * This is a skeleton — real audio backends will be injected later.
 * The controller is intentionally thin so it can be tested without hardware.
 */
export class VoiceModeController {
  private state: VoiceState = VoiceState.Idle;
  private readonly audioInput: AudioInputProvider;
  private readonly stt: SpeechToTextAdapter;
  private readonly tts: TextToSpeechAdapter;
  private readonly config: VoiceSessionConfig;

  constructor(
    audioInput: AudioInputProvider,
    stt: SpeechToTextAdapter,
    tts: TextToSpeechAdapter,
    config: VoiceSessionConfig = {},
  ) {
    this.audioInput = audioInput;
    this.stt = stt;
    this.tts = tts;
    this.config = config;
  }

  /** Current lifecycle state. */
  getState(): VoiceState {
    return this.state;
  }

  /**
   * Start the voice session.
   * Opens the audio input and begins the listen loop.
   */
  async start(): Promise<void> {
    if (this.state !== VoiceState.Idle) {
      debugLogger.warn(
        `VoiceModeController.start() called in state "${this.state}", ignoring.`,
      );
      return;
    }

    debugLogger.log(
      `[voice] Starting voice mode (locale=${this.config.locale ?? 'default'}, ` +
        `sampleRate=${String(this.config.sampleRate ?? 16000)})`,
    );

    this.state = VoiceState.Listening;

    await this.audioInput.start(async (chunk) => {
      if (this.state !== VoiceState.Listening) return;

      try {
        this.state = VoiceState.Processing;
        const transcript = await this.stt.transcribe(chunk);

        if (transcript.trim().length === 0) {
          this.state = VoiceState.Listening;
          return;
        }

        debugLogger.log(`[voice] Transcript: "${transcript}"`);

        // In the future this is where the transcript feeds into the Gemini
        // conversation loop (GeminiClient.sendMessageStream). For now, we
        // echo it back through TTS as a proof-of-lifecycle.
        this.state = VoiceState.Speaking;
        await this.tts.speak(transcript);
      } catch (err) {
        debugLogger.error('[voice] Error in voice pipeline:', err);
        this.state = VoiceState.Error;
      } finally {
        if (
          this.state === VoiceState.Speaking ||
          this.state === VoiceState.Processing
        ) {
          this.state = VoiceState.Listening;
        }
      }
    });
  }

  /** Stop the voice session and release resources. */
  async stop(): Promise<void> {
    debugLogger.log('[voice] Stopping voice mode.');
    await this.tts.cancel();
    await this.audioInput.stop();
    this.state = VoiceState.Idle;
  }
}
