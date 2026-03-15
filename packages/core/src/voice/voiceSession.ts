/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, type Session } from '@google/genai';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Minimal shape of a Live API part that carries inline audio data. */
interface LiveInlineDataPart {
  inlineData: { mimeType: string; data: string };
}

/** Minimal shape of a Live API part that carries text. */
interface LiveTextPart {
  text: string;
}

function isInlineDataPart(p: unknown): p is LiveInlineDataPart {
  return (
    isObject(p) &&
    isObject(p['inlineData']) &&
    isString(p['inlineData']['mimeType']) &&
    isString(p['inlineData']['data'])
  );
}

function isTextPart(p: unknown): p is LiveTextPart {
  return isObject(p) && isString(p['text']) && p['text'] !== '';
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
import { EventEmitter } from 'node:events';
import { formatForSpeech } from './responseFormatter.js';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface VoiceSessionConfig {
  apiKey: string;
  model?: string;
  voiceName?: string;
  systemInstruction?: string;
  onStateChange?: (state: VoiceState) => void;
  onTranscript?: (text: string, isUser: boolean) => void;
  onAudioChunk?: (pcm: Buffer) => void;
  onError?: (err: Error) => void;
}

/**
 * VoiceSession manages a single bidirectional Live API session with Gemini.
 * It handles sending PCM audio chunks, receiving audio/text responses,
 * and emitting lifecycle events (state changes, transcripts, audio output).
 */
export class VoiceSession extends EventEmitter {
  private session: Session | null = null;
  private state: VoiceState = 'idle';
  private readonly config: VoiceSessionConfig;

  // Default live model — Vertex AI uses a different name
  static readonly DEFAULT_MODEL = 'gemini-live-2.5-flash-preview';
  static readonly VERTEX_MODEL = 'gemini-2.0-flash-live-preview-04-09';

  constructor(config: VoiceSessionConfig) {
    super();
    this.config = config;
  }

  get currentState(): VoiceState {
    return this.state;
  }

  private setState(next: VoiceState): void {
    if (this.state === next) return;
    this.state = next;
    this.config.onStateChange?.(next);
    this.emit('stateChange', next);
  }

  /** Open the WebSocket connection to the Live API. */
  async connect(): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    const model = this.config.model ?? VoiceSession.DEFAULT_MODEL;

    this.session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.config.voiceName ?? 'Aoede',
            },
          },
        },
        systemInstruction: this.config.systemInstruction
          ? { parts: [{ text: this.config.systemInstruction }] }
          : undefined,
      },
      callbacks: {
        onopen: () => {
          this.setState('listening');
          this.emit('connected');
        },
        onmessage: (e) => {
          // e.data is typed as unknown in the Live API callback
          const raw: unknown = (e as { data: unknown }).data;
          this._handleServerMessage(isString(raw) ? raw : JSON.stringify(raw));
        },
        onerror: (e) => {
          const msg =
            isObject(e) && isString(e['message'])
              ? e['message']
              : 'Live API error';
          const err = new Error(msg);
          this.setState('error');
          this.config.onError?.(err);
          this.emit('error', err);
        },
        onclose: () => {
          this.setState('idle');
          this.emit('disconnected');
        },
      },
    });
  }

  /**
   * Send a raw PCM audio chunk (16-bit LE, 16kHz mono) to the Live API.
   * Called continuously while the microphone is active.
   */
  sendAudioChunk(pcm: Buffer): void {
    if (!this.session || this.state === 'idle' || this.state === 'error') {
      return;
    }
    this.session.sendRealtimeInput({
      audio: {
        data: pcm.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  }

  /**
   * Send a text message (used for Push-to-Talk transcription fallback
   * or programmatic injection).
   */
  sendText(text: string): void {
    if (!this.session) return;
    this.setState('processing');
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    });
  }

  /** Signal that the audio stream has ended (microphone off). */
  sendAudioStreamEnd(): void {
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }

  /** Interrupt the current model response (speak to stop). */
  interrupt(): void {
    if (this.state === 'speaking') {
      // Sending audioStreamEnd or a new content turn interrupts generation
      this.sendAudioStreamEnd();
      this.setState('listening');
      this.emit('interrupted');
    }
  }

  /** Close the session. */
  close(): void {
    this.session?.conn?.close();
    this.session = null;
    this.setState('idle');
  }

  private _handleServerMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isObject(msg)) return;

    // Extract server content (audio + text)
    const serverContent = msg['serverContent'];
    if (isObject(serverContent)) {
      this.setState('speaking');

      const modelTurn = serverContent['modelTurn'];
      const rawParts = isObject(modelTurn) ? modelTurn['parts'] : undefined;
      const parts: unknown[] = Array.isArray(rawParts) ? rawParts : [];

      for (const part of parts) {
        if (!isObject(part)) continue;

        // Audio response
        if (
          isInlineDataPart(part) &&
          part.inlineData.mimeType.startsWith('audio/')
        ) {
          const pcm = Buffer.from(part.inlineData.data, 'base64');
          this.config.onAudioChunk?.(pcm);
          this.emit('audioChunk', pcm);
        }

        // Text response (transcript)
        if (isTextPart(part)) {
          const spoken = formatForSpeech(part.text);
          this.config.onTranscript?.(spoken, false);
          this.emit('transcript', spoken, false);
        }
      }

      // turnComplete → back to listening
      if (serverContent['turnComplete']) {
        this.setState('listening');
      }
    }

    // Input transcription (what the user said)
    const inputTranscription = msg['inputTranscription'];
    if (isObject(inputTranscription)) {
      if (isTextPart(inputTranscription)) {
        this.config.onTranscript?.(inputTranscription.text, true);
        this.emit('transcript', inputTranscription.text, true);
      }
      this.setState('processing');
    }
  }
}
