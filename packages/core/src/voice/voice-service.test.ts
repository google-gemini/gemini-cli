/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GoogleGenAI, Session, LiveCallbacks } from '@google/genai';

import { VoiceService } from './voice-service.js';
import {
  VoiceSessionState,
  VoiceEvent,
  createDefaultVoiceConfig,
  buildSpeechConfig,
} from './types.js';

// ── Test Helpers ────────────────────────────────────────────────

/** Creates a minimal mock Session. */
function createMockSession(): Session {
  return {
    sendClientContent: vi.fn(),
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
    close: vi.fn(),
    conn: {} as unknown,
  } as unknown as Session;
}

/**
 * Creates a mock GoogleGenAI that captures the callbacks so tests
 * can simulate server messages.
 */
function createMockGenAI(): {
  genai: GoogleGenAI;
  mockSession: Session;
  getCallbacks: () => LiveCallbacks;
} {
  const mockSession = createMockSession();
  let capturedCallbacks: LiveCallbacks | undefined;

  const genai = {
    live: {
      connect: vi.fn(async (params: { callbacks: LiveCallbacks }) => {
        capturedCallbacks = params.callbacks;
        // Simulate WebSocket open
        if (capturedCallbacks.onopen) {
          capturedCallbacks.onopen();
        }
        return mockSession;
      }),
    },
  } as unknown as GoogleGenAI;

  return {
    genai,
    mockSession,
    getCallbacks: () => {
      if (!capturedCallbacks) {
        throw new Error('connect() has not been called yet');
      }
      return capturedCallbacks;
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('VoiceService', () => {
  let genai: GoogleGenAI;
  let mockSession: Session;
  let getCallbacks: () => LiveCallbacks;

  beforeEach(() => {
    const mocks = createMockGenAI();
    genai = mocks.genai;
    mockSession = mocks.mockSession;
    getCallbacks = mocks.getCallbacks;
  });

  // ── Constructor & Config ──────────────────────────────────────

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const service = new VoiceService(genai);
      const config = service.getConfig();

      expect(config.model).toBe('gemini-live-2.5-flash-preview');
      expect(config.responseModality).toBe('text');
      expect(config.useServerVAD).toBe(true);
      expect(config.inputSampleRate).toBe(16000);
      expect(config.outputSampleRate).toBe(24000);
    });

    it('should accept config overrides', () => {
      const service = new VoiceService(genai, {
        model: 'gemini-2.0-flash-live-preview',
        responseModality: 'audio',
        voice: { voiceName: 'Puck' },
      });
      const config = service.getConfig();

      expect(config.model).toBe('gemini-2.0-flash-live-preview');
      expect(config.responseModality).toBe('audio');
      expect(config.voice?.voiceName).toBe('Puck');
      // Defaults still applied
      expect(config.useServerVAD).toBe(true);
    });

    it('should start in IDLE state', () => {
      const service = new VoiceService(genai);
      expect(service.getState()).toBe(VoiceSessionState.IDLE);
    });
  });

  describe('updateConfig', () => {
    it('should update config when IDLE', () => {
      const service = new VoiceService(genai);
      service.updateConfig({ model: 'different-model' });
      expect(service.getConfig().model).toBe('different-model');
    });

    it('should throw when session is active', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      expect(() => service.updateConfig({ model: 'other' })).toThrow(
        'Cannot update voice config while session is active',
      );
    });
  });

  // ── Connection Lifecycle ──────────────────────────────────────

  describe('connect', () => {
    it('should transition through CONNECTING to CONNECTED', async () => {
      const service = new VoiceService(genai);
      const states: VoiceSessionState[] = [];

      service.on(VoiceEvent.STATE_CHANGED, ({ currentState }) => {
        states.push(currentState);
      });

      await service.connect();

      expect(states).toEqual([
        VoiceSessionState.CONNECTING,
        VoiceSessionState.CONNECTED,
      ]);
      expect(service.getState()).toBe(VoiceSessionState.CONNECTED);
    });

    it('should pass text response modality to Live API', async () => {
      const service = new VoiceService(genai, {
        responseModality: 'text',
      });

      await service.connect();

      const connectCall = vi.mocked(genai.live.connect).mock.calls[0];
      if (connectCall) {
        const params = connectCall[0] as {
          config: { responseModalities: string[] };
        };
        expect(params.config.responseModalities).toContain('TEXT');
      }
    });

    it('should pass system instruction and speech config', async () => {
      const service = new VoiceService(genai, {
        systemInstruction: 'Be helpful.',
        voice: { voiceName: 'Kore' },
        languageCode: 'en-US',
      });

      await service.connect();

      const connectCall = vi.mocked(genai.live.connect).mock.calls[0];
      if (connectCall) {
        const params = connectCall[0] as {
          config: {
            systemInstruction?: string;
            speechConfig?: {
              voiceConfig?: { prebuiltVoiceConfig?: { voiceName: string } };
              languageCode?: string;
            };
          };
        };
        expect(params.config.systemInstruction).toBe('Be helpful.');
        expect(
          params.config.speechConfig?.voiceConfig?.prebuiltVoiceConfig
            ?.voiceName,
        ).toBe('Kore');
        expect(params.config.speechConfig?.languageCode).toBe('en-US');
      }
    });

    it('should pass server VAD config', async () => {
      const service = new VoiceService(genai, { useServerVAD: false });

      await service.connect();

      const connectCall = vi.mocked(genai.live.connect).mock.calls[0];
      if (connectCall) {
        const params = connectCall[0] as {
          config: {
            realtimeInputConfig?: {
              automaticActivityDetection?: { disabled?: boolean };
            };
          };
        };
        expect(
          params.config.realtimeInputConfig?.automaticActivityDetection
            ?.disabled,
        ).toBe(true);
      }
    });

    it('should pass tools when provided', async () => {
      const service = new VoiceService(genai);
      const tools = [{ name: 'read_file', description: 'Read a file' }];

      await service.connect(tools);

      const connectCall = vi.mocked(genai.live.connect).mock.calls[0];
      if (connectCall) {
        const params = connectCall[0] as {
          config: { tools?: Array<{ functionDeclarations: unknown[] }> };
        };
        expect(params.config.tools).toHaveLength(1);
        expect(params.config.tools?.[0]?.functionDeclarations).toEqual(tools);
      }
    });

    it('should throw if already connected', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      await expect(service.connect()).rejects.toThrow(
        "Cannot connect: session is in 'connected' state",
      );
    });

    it('should allow reconnection from ERROR state', async () => {
      // Create a genai that fails first, then succeeds
      const failMockSession = createMockSession();
      let callCount = 0;
      const retryGenai = {
        live: {
          connect: vi.fn(async (params: { callbacks: LiveCallbacks }) => {
            callCount++;
            if (callCount === 1) {
              throw new Error('Connection refused');
            }
            // Second call succeeds
            if (params.callbacks.onopen) {
              params.callbacks.onopen();
            }
            return failMockSession;
          }),
        },
      } as unknown as GoogleGenAI;

      const service = new VoiceService(retryGenai);
      await expect(service.connect()).rejects.toThrow('Connection refused');
      expect(service.getState()).toBe(VoiceSessionState.ERROR);

      // Should be able to reconnect from ERROR state
      await service.connect();
      expect(service.getState()).toBe(VoiceSessionState.CONNECTED);
    });

    it('should transition to ERROR and emit error on connection failure', async () => {
      const failGenai = {
        live: {
          connect: vi.fn(async () => {
            throw new Error('Network error');
          }),
        },
      } as unknown as GoogleGenAI;

      const service = new VoiceService(failGenai);
      const errors: Error[] = [];
      service.on(VoiceEvent.ERROR, ({ error }) => errors.push(error));

      await expect(service.connect()).rejects.toThrow('Network error');
      expect(service.getState()).toBe(VoiceSessionState.ERROR);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Network error');
    });
  });

  describe('disconnect', () => {
    it('should close session and transition to IDLE', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      await service.disconnect();

      expect(mockSession.close).toHaveBeenCalled();
      expect(service.getState()).toBe(VoiceSessionState.IDLE);
      expect(service.isConnected()).toBe(false);
    });

    it('should be idempotent when already IDLE', async () => {
      const service = new VoiceService(genai);
      await service.disconnect(); // should not throw
      expect(service.getState()).toBe(VoiceSessionState.IDLE);
    });

    it('should emit STATE_CHANGED events during disconnect', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const states: VoiceSessionState[] = [];
      service.on(VoiceEvent.STATE_CHANGED, ({ currentState }) => {
        states.push(currentState);
      });

      await service.disconnect();

      expect(states).toEqual([
        VoiceSessionState.DISCONNECTING,
        VoiceSessionState.IDLE,
      ]);
    });
  });

  describe('isConnected', () => {
    it('should return false when IDLE', () => {
      const service = new VoiceService(genai);
      expect(service.isConnected()).toBe(false);
    });

    it('should return true when CONNECTED', async () => {
      const service = new VoiceService(genai);
      await service.connect();
      expect(service.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      const service = new VoiceService(genai);
      await service.connect();
      await service.disconnect();
      expect(service.isConnected()).toBe(false);
    });
  });

  // ── Sending Data ──────────────────────────────────────────────

  describe('sendText', () => {
    it('should send text via session.sendClientContent', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendText('Hello there');

      expect(mockSession.sendClientContent).toHaveBeenCalledWith({
        turns: 'Hello there',
        turnComplete: true,
      });
    });

    it('should transition to RESPONDING on turnComplete=true', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendText('Hello');

      expect(service.getState()).toBe(VoiceSessionState.RESPONDING);
    });

    it('should not transition to RESPONDING on turnComplete=false', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendText('partial input', false);

      expect(service.getState()).toBe(VoiceSessionState.CONNECTED);
    });

    it('should throw when not connected', () => {
      const service = new VoiceService(genai);
      expect(() => service.sendText('hello')).toThrow(
        'Voice service is not connected',
      );
    });
  });

  describe('sendAudio', () => {
    it('should send audio via session.sendRealtimeInput', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendAudio('base64data');

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
        audio: {
          data: 'base64data',
          mimeType: 'audio/pcm',
        },
      });
    });

    it('should transition to LISTENING from CONNECTED', async () => {
      const service = new VoiceService(genai);
      await service.connect();
      expect(service.getState()).toBe(VoiceSessionState.CONNECTED);

      service.sendAudio('data');

      expect(service.getState()).toBe(VoiceSessionState.LISTENING);
    });

    it('should accept custom mimeType', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendAudio('data', 'audio/wav');

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
        audio: {
          data: 'data',
          mimeType: 'audio/wav',
        },
      });
    });

    it('should throw when not connected', () => {
      const service = new VoiceService(genai);
      expect(() => service.sendAudio('data')).toThrow(
        'Voice service is not connected',
      );
    });
  });

  describe('sendAudioStreamEnd', () => {
    it('should send audioStreamEnd signal', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendAudioStreamEnd();

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
        audioStreamEnd: true,
      });
    });

    it('should throw when not connected', () => {
      const service = new VoiceService(genai);
      expect(() => service.sendAudioStreamEnd()).toThrow(
        'Voice service is not connected',
      );
    });
  });

  describe('sendToolResponse', () => {
    it('should forward function responses to session', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const responses = [
        { name: 'read_file', response: { content: 'file contents' } },
      ];

      service.sendToolResponse(responses);

      expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
        functionResponses: responses,
      });
    });

    it('should throw when not connected', () => {
      const service = new VoiceService(genai);
      expect(() =>
        service.sendToolResponse([
          { name: 'test', response: { result: 'ok' } },
        ]),
      ).toThrow('Voice service is not connected');
    });
  });

  describe('sendInterrupt', () => {
    it('should send turnComplete=false to signal barge-in', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      service.sendInterrupt();

      expect(mockSession.sendClientContent).toHaveBeenCalledWith({
        turnComplete: false,
      });
    });
  });

  // ── Server Message Handling ───────────────────────────────────

  describe('server messages', () => {
    it('should emit TEXT_RESPONSE for model text parts', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const texts: string[] = [];
      service.on(VoiceEvent.TEXT_RESPONSE, ({ text }) => texts.push(text));

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: {
          modelTurn: {
            parts: [{ text: 'Hello from Gemini' }],
          },
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(texts).toEqual(['Hello from Gemini']);
    });

    it('should emit AUDIO_RESPONSE for model audio parts', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const audioChunks: Array<{ data: string; mimeType: string }> = [];
      service.on(VoiceEvent.AUDIO_RESPONSE, (payload) =>
        audioChunks.push(payload),
      );

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: {
          modelTurn: {
            parts: [
              {
                inlineData: {
                  data: 'audioBase64',
                  mimeType: 'audio/pcm;rate=24000',
                },
              },
            ],
          },
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(audioChunks).toHaveLength(1);
      expect(audioChunks[0]?.data).toBe('audioBase64');
    });

    it('should emit TURN_COMPLETE and transition to LISTENING', async () => {
      const service = new VoiceService(genai);
      await service.connect();
      service.sendText('test'); // move to RESPONDING

      let turnComplete = false;
      service.on(VoiceEvent.TURN_COMPLETE, () => {
        turnComplete = true;
      });

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: { turnComplete: true },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(turnComplete).toBe(true);
      expect(service.getState()).toBe(VoiceSessionState.LISTENING);
    });

    it('should emit INTERRUPTED and transition to LISTENING', async () => {
      const service = new VoiceService(genai);
      await service.connect();
      service.sendText('test'); // move to RESPONDING

      let interrupted = false;
      service.on(VoiceEvent.INTERRUPTED, () => {
        interrupted = true;
      });

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: { interrupted: true },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(interrupted).toBe(true);
      expect(service.getState()).toBe(VoiceSessionState.LISTENING);
    });

    it('should emit INPUT_TRANSCRIPTION', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const transcriptions: string[] = [];
      service.on(VoiceEvent.INPUT_TRANSCRIPTION, ({ text }) =>
        transcriptions.push(text),
      );

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: {
          inputTranscription: { text: 'user said this' },
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(transcriptions).toEqual(['user said this']);
    });

    it('should emit OUTPUT_TRANSCRIPTION', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const transcriptions: string[] = [];
      service.on(VoiceEvent.OUTPUT_TRANSCRIPTION, ({ text }) =>
        transcriptions.push(text),
      );

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: {
          outputTranscription: { text: 'model said this' },
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(transcriptions).toEqual(['model said this']);
    });

    it('should not emit transcription for empty text', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const transcriptions: string[] = [];
      service.on(VoiceEvent.INPUT_TRANSCRIPTION, ({ text }) =>
        transcriptions.push(text),
      );

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: { inputTranscription: { text: '' } },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(transcriptions).toHaveLength(0);
    });

    it('should emit TOOL_CALL with function calls', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const toolCalls: Array<{ name: string }> = [];
      service.on(VoiceEvent.TOOL_CALL, ({ functionCalls }) => {
        for (const fc of functionCalls) {
          toolCalls.push({ name: fc.name ?? '' });
        }
      });

      const callbacks = getCallbacks();
      callbacks.onmessage({
        toolCall: {
          functionCalls: [
            { name: 'read_file', args: { path: '/tmp/test.txt' } },
          ],
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(toolCalls).toEqual([{ name: 'read_file' }]);
    });

    it('should emit TOOL_CALL_CANCELLATION', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const cancelledIds: string[][] = [];
      service.on(VoiceEvent.TOOL_CALL_CANCELLATION, ({ ids }) =>
        cancelledIds.push(ids),
      );

      const callbacks = getCallbacks();
      callbacks.onmessage({
        toolCallCancellation: { ids: ['call-1', 'call-2'] },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(cancelledIds).toEqual([['call-1', 'call-2']]);
    });

    it('should emit GO_AWAY when server signals disconnect', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      let goAwayPayload: { timeLeft?: string } | undefined;
      service.on(VoiceEvent.GO_AWAY, (payload) => {
        goAwayPayload = payload;
      });

      const callbacks = getCallbacks();
      callbacks.onmessage({
        goAway: { timeLeft: '30s' },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(goAwayPayload?.timeLeft).toBe('30s');
    });

    it('should not emit TEXT_RESPONSE for empty text', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const texts: string[] = [];
      service.on(VoiceEvent.TEXT_RESPONSE, ({ text }) => texts.push(text));

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: {
          modelTurn: {
            parts: [{ text: '' }],
          },
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(texts).toHaveLength(0);
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('should transition to ERROR on WebSocket error', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const errors: Error[] = [];
      service.on(VoiceEvent.ERROR, ({ error }) => errors.push(error));

      const callbacks = getCallbacks();
      if (callbacks.onerror) {
        callbacks.onerror({
          message: 'WebSocket error',
        } as ErrorEvent);
      }

      expect(service.getState()).toBe(VoiceSessionState.ERROR);
      expect(errors).toHaveLength(1);
    });

    it('should handle non-Error objects in onerror callback', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const errors: Error[] = [];
      service.on(VoiceEvent.ERROR, ({ error }) => errors.push(error));

      const callbacks = getCallbacks();
      if (callbacks.onerror) {
        callbacks.onerror({
          message: 'string error',
        } as ErrorEvent);
      }

      expect(errors).toHaveLength(1);
    });

    it('should transition to IDLE on WebSocket close', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const callbacks = getCallbacks();
      if (callbacks.onclose) {
        callbacks.onclose({} as CloseEvent);
      }

      expect(service.getState()).toBe(VoiceSessionState.IDLE);
    });
  });

  // ── Event Listeners ───────────────────────────────────────────

  describe('event listeners', () => {
    it('should support on/off for events', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const states: VoiceSessionState[] = [];
      const listener = ({
        currentState,
      }: {
        currentState: VoiceSessionState;
      }) => {
        states.push(currentState);
      };

      service.on(VoiceEvent.STATE_CHANGED, listener);
      service.sendText('first');
      expect(states).toContain(VoiceSessionState.RESPONDING);

      service.off(VoiceEvent.STATE_CHANGED, listener);
      // Further state changes should not be captured
      const lengthBefore = states.length;
      await service.disconnect();
      expect(states.length).toBe(lengthBefore);
    });

    it('should support removeAllListeners', async () => {
      const service = new VoiceService(genai);
      await service.connect();

      const texts: string[] = [];
      service.on(VoiceEvent.TEXT_RESPONSE, ({ text }) => texts.push(text));

      service.removeAllListeners();

      const callbacks = getCallbacks();
      callbacks.onmessage({
        serverContent: {
          modelTurn: { parts: [{ text: 'ignored' }] },
        },
      } as unknown as Parameters<NonNullable<LiveCallbacks['onmessage']>>[0]);

      expect(texts).toHaveLength(0);
    });
  });
});

// ── Types tests ─────────────────────────────────────────────────

describe('voice types', () => {
  describe('createDefaultVoiceConfig', () => {
    it('should return sensible defaults', () => {
      const config = createDefaultVoiceConfig();

      expect(config.model).toBe('gemini-live-2.5-flash-preview');
      expect(config.responseModality).toBe('text');
      expect(config.useServerVAD).toBe(true);
      expect(config.inputSampleRate).toBe(16000);
      expect(config.outputSampleRate).toBe(24000);
      expect(config.systemInstruction).toBeUndefined();
      expect(config.voice).toBeUndefined();
      expect(config.languageCode).toBeUndefined();
    });

    it('should apply overrides', () => {
      const config = createDefaultVoiceConfig({
        model: 'custom-model',
        responseModality: 'audio',
        voice: { voiceName: 'Puck' },
        languageCode: 'ja-JP',
      });

      expect(config.model).toBe('custom-model');
      expect(config.responseModality).toBe('audio');
      expect(config.voice?.voiceName).toBe('Puck');
      expect(config.languageCode).toBe('ja-JP');
      // Defaults still filled in
      expect(config.useServerVAD).toBe(true);
      expect(config.inputSampleRate).toBe(16000);
    });
  });

  describe('buildSpeechConfig', () => {
    it('should return empty config when no voice or language set', () => {
      const config = createDefaultVoiceConfig();
      const speech = buildSpeechConfig(config);

      expect(speech.voiceConfig).toBeUndefined();
      expect(speech.languageCode).toBeUndefined();
    });

    it('should include voice config when voice is set', () => {
      const config = createDefaultVoiceConfig({
        voice: { voiceName: 'Kore' },
      });
      const speech = buildSpeechConfig(config);

      expect(speech.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Kore');
    });

    it('should include language code when set', () => {
      const config = createDefaultVoiceConfig({
        languageCode: 'fr-FR',
      });
      const speech = buildSpeechConfig(config);

      expect(speech.languageCode).toBe('fr-FR');
    });

    it('should include both voice and language', () => {
      const config = createDefaultVoiceConfig({
        voice: { voiceName: 'Puck' },
        languageCode: 'en-GB',
      });
      const speech = buildSpeechConfig(config);

      expect(speech.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Puck');
      expect(speech.languageCode).toBe('en-GB');
    });
  });
});
