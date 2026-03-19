/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceSession } from './voiceSession.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendRealtimeInput = vi.fn();
const mockSendClientContent = vi.fn();
const mockClose = vi.fn();

const mockSession = {
  sendRealtimeInput: mockSendRealtimeInput,
  sendClientContent: mockSendClientContent,
  conn: { close: mockClose },
};

let capturedCallbacks: Record<string, (e: unknown) => void> = {};

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    live: {
      connect: vi.fn().mockImplementation(({ callbacks }) => {
        capturedCallbacks = callbacks;
        return Promise.resolve(mockSession);
      }),
    },
  })),
  Modality: { AUDIO: 'AUDIO' },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return new VoiceSession({ apiKey: 'test-key', ...overrides });
}

// Simulate a server message JSON string
function serverMsg(payload: object): string {
  return JSON.stringify(payload);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VoiceSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallbacks = {};
  });

  it('starts in idle state', () => {
    const vs = makeSession();
    expect(vs.currentState).toBe('idle');
  });

  it('transitions to listening after connect onopen', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});
    expect(vs.currentState).toBe('listening');
  });

  it('sends audio chunk via sendRealtimeInput', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    const pcm = Buffer.from([0x00, 0x01, 0x02]);
    vs.sendAudioChunk(pcm);

    expect(mockSendRealtimeInput).toHaveBeenCalledWith({
      audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
    });
  });

  it('does not send audio when idle', () => {
    const vs = makeSession();
    vs.sendAudioChunk(Buffer.alloc(4));
    expect(mockSendRealtimeInput).not.toHaveBeenCalled();
  });

  it('transitions to speaking on modelTurn audio response', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    const audioData = Buffer.from('fake-pcm').toString('base64');
    capturedCallbacks['onmessage']?.({
      data: serverMsg({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm', data: audioData } }],
          },
        },
      }),
    });

    expect(vs.currentState).toBe('speaking');
  });

  it('emits audioChunk event with PCM buffer', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    const onChunk = vi.fn();
    vs.on('audioChunk', onChunk);

    const audioData = Buffer.from('pcm-data').toString('base64');
    capturedCallbacks['onmessage']?.({
      data: serverMsg({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm', data: audioData } }],
          },
        },
      }),
    });

    expect(onChunk).toHaveBeenCalledOnce();
    expect(Buffer.isBuffer(onChunk.mock.calls[0][0])).toBe(true);
  });

  it('transitions back to listening on turnComplete', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    capturedCallbacks['onmessage']?.({
      data: serverMsg({
        serverContent: {
          modelTurn: { parts: [] },
          turnComplete: true,
        },
      }),
    });

    expect(vs.currentState).toBe('listening');
  });

  it('emits transcript for model text response', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    const onTranscript = vi.fn();
    vs.on('transcript', onTranscript);

    capturedCallbacks['onmessage']?.({
      data: serverMsg({
        serverContent: {
          modelTurn: { parts: [{ text: 'Hello world' }] },
        },
      }),
    });

    expect(onTranscript).toHaveBeenCalledWith(expect.any(String), false);
  });

  it('emits transcript for user input transcription', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    const onTranscript = vi.fn();
    vs.on('transcript', onTranscript);

    capturedCallbacks['onmessage']?.({
      data: serverMsg({ inputTranscription: { text: 'user said this' } }),
    });

    expect(onTranscript).toHaveBeenCalledWith('user said this', true);
  });

  it('transitions to error state on onerror', async () => {
    const vs = makeSession();
    vs.on('error', () => {}); // prevent unhandled error throw
    await vs.connect();
    capturedCallbacks['onerror']?.({ message: 'connection failed' });
    expect(vs.currentState).toBe('error');
  });

  it('transitions to idle on close', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});
    capturedCallbacks['onclose']?.({});
    expect(vs.currentState).toBe('idle');
  });

  it('sendText sets state to processing', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    vs.sendText('hello');
    expect(vs.currentState).toBe('processing');
    expect(mockSendClientContent).toHaveBeenCalledWith({
      turns: [{ role: 'user', parts: [{ text: 'hello' }] }],
      turnComplete: true,
    });
  });

  it('interrupt transitions from speaking to listening', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});

    // Force speaking state
    capturedCallbacks['onmessage']?.({
      data: serverMsg({
        serverContent: { modelTurn: { parts: [] } },
      }),
    });

    vs.interrupt();
    expect(vs.currentState).toBe('listening');
  });

  it('close resets state to idle', async () => {
    const vs = makeSession();
    await vs.connect();
    capturedCallbacks['onopen']?.({});
    vs.close();
    expect(vs.currentState).toBe('idle');
  });
});
