/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { debugLogger } from '../utils/debugLogger.js';

export interface LiveTranscriptionEvents {
  transcription: [string];
  turnComplete: [];
  error: [Error];
  close: [];
}

/**
 * Connects to the Gemini Live API using raw WebSockets to support API Key authentication.
 */
export class LiveTranscriptionService extends EventEmitter<LiveTranscriptionEvents> {
  private ws: WebSocket | null = null;
  private currentTranscription = '';

  constructor(private readonly apiKey: string) {
    super();
  }

  async connect(): Promise<void> {
    const modelName = 'gemini-3.1-flash-live-preview';
    const baseUrl =
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

    if (!this.apiKey) {
      throw new Error('No API key provided');
    }

    const url = `${baseUrl}?key=${this.apiKey}`;
    debugLogger.debug(
      `[LiveTranscription] Connecting to model ${modelName} via raw WebSocket with API Key...`,
    );

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          const setupMessage = {
            setup: {
              model: `models/${modelName}`,
              generation_config: {
                response_modalities: ['audio'],
              },
              input_audio_transcription: {},
            },
          };

          this.ws?.send(JSON.stringify(setupMessage));
          this.currentTranscription = '';
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            // Use unknown instead of any to safely parse JSON
            const parsedData: unknown = JSON.parse(data.toString());

            // Simple type guard to safely assert the shape we expect
            if (typeof parsedData === 'object' && parsedData !== null) {
              const response = parsedData as {
                setupComplete?: Record<string, unknown>;
                serverContent?: {
                  turnComplete?: boolean;
                  inputTranscription?: { text?: string };
                  outputTranscription?: { text?: string };
                  modelTurn?: {
                    parts?: Array<{
                      text?: string;
                      inlineData?: { data: string };
                    }>;
                  };
                };
              };

              if (response.setupComplete) {
                // Setup complete
              }

              if (response.serverContent) {
                const content = response.serverContent;

                if (content.turnComplete) {
                  this.emit('turnComplete');
                }

                // 1. Handle user's input transcription (the "Claude Code" experience)
                if (content.inputTranscription?.text) {
                  const text = content.inputTranscription.text;
                  this.currentTranscription = text;
                  this.emit('transcription', this.currentTranscription);
                }

                // 2. Handle model's output transcription (if enabled)
                if (content.outputTranscription?.text) {
                  // const text = content.outputTranscription.text;
                }

                // 3. Handle model turn parts (text or audio)
                if (content.modelTurn?.parts) {
                  for (const part of content.modelTurn.parts) {
                    if (part.text) {
                      // text part
                    }
                    if (part.inlineData) {
                      // Audio data received
                    }
                  }
                }
              }
            }
          } catch (e) {
            debugLogger.error('[LiveTranscription] Error parsing message:', e);
          }
        });

        this.ws.on('error', (error) => {
          debugLogger.error('[LiveTranscription] WebSocket Error:', error);
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          debugLogger.debug(
            `[LiveTranscription] Connection Closed. Code: ${code}, Reason: ${reason}`,
          );
          this.emit('close');
          this.ws = null;
        });
      } catch (err) {
        debugLogger.error(
          '[LiveTranscription] Failed to establish connection:',
          err,
        );
        reject(err);
      }
    });
  }

  sendAudioChunk(chunk: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const audioMessage = {
      realtime_input: {
        audio: {
          data: chunk.toString('base64'),
          mime_type: 'audio/pcm;rate=16000',
        },
      },
    };
    this.ws.send(JSON.stringify(audioMessage));
  }

  endAudioStream(): void {
    // The raw protocol doesn't have a specific endAudioStream like the SDK,
    // but we can send an empty chunk or just close if needed.
    // For now, we'll just keep it as a no-op or close.
  }

  getTranscription(): string {
    return this.currentTranscription;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
