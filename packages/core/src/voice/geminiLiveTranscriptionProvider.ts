/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { debugLogger } from '../utils/debugLogger.js';
import type {
  TranscriptionProvider,
  TranscriptionEvents,
} from './transcriptionProvider.js';

import { z } from 'zod';

const LiveAPIResponseSchema = z.object({
  setupComplete: z.record(z.unknown()).optional(),
  serverContent: z
    .object({
      turnComplete: z.boolean().optional(),
      inputTranscription: z
        .object({
          text: z.string().optional(),
        })
        .optional(),
      outputTranscription: z
        .object({
          text: z.string().optional(),
        })
        .optional(),
      modelTurn: z
        .object({
          parts: z
            .array(
              z.object({
                text: z.string().optional(),
                inlineData: z
                  .object({
                    data: z.string(),
                  })
                  .optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Connects to the Gemini Live API using raw WebSockets to support API Key authentication.
 */
export class GeminiLiveTranscriptionProvider
  extends EventEmitter<TranscriptionEvents>
  implements TranscriptionProvider
{
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
      `[GeminiLiveTranscription] Connecting to model ${modelName} via raw WebSocket with API Key...`,
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
            const parsedData: unknown = JSON.parse(data.toString());
            const result = LiveAPIResponseSchema.safeParse(parsedData);

            if (result.success) {
              const response = result.data;
              if (response.serverContent) {
                const content = response.serverContent;

                if (content.turnComplete) {
                  this.emit('turnComplete');
                }

                if (content.inputTranscription?.text) {
                  const text = content.inputTranscription.text;
                  debugLogger.debug(
                    `[GeminiLiveTranscription] Transcription received (Cloud): "${text}"`,
                  );
                  this.currentTranscription = text;
                  this.emit('transcription', this.currentTranscription);
                }
              }
            }
          } catch (e) {
            debugLogger.error(
              '[GeminiLiveTranscription] Error parsing message:',
              e,
            );
          }
        });

        this.ws.on('error', (error) => {
          debugLogger.error(
            '[GeminiLiveTranscription] WebSocket Error:',
            error,
          );
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          debugLogger.debug(
            `[GeminiLiveTranscription] Connection Closed. Code: ${code}, Reason: ${reason}`,
          );
          this.emit('close');
          this.ws = null;
        });
      } catch (err) {
        debugLogger.error(
          '[GeminiLiveTranscription] Failed to establish connection:',
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
