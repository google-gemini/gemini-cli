/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { GeminiLiveTranscriptionProvider } from './geminiLiveTranscriptionProvider.js';

vi.mock('ws', () => {
  const MockWebSocket = vi.fn();
  Object.assign(MockWebSocket, { OPEN: 1 });
  return { default: MockWebSocket };
});

describe('GeminiLiveTranscriptionProvider', () => {
  function createMockSocket() {
    const socket = Object.assign(new EventEmitter(), {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    });
    vi.mocked(WebSocket).mockReturnValue(socket as unknown as WebSocket);
    return socket;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should wait for setup completion after the socket opens', async () => {
    vi.useFakeTimers();
    const socket = createMockSocket();
    const provider = new GeminiLiveTranscriptionProvider('api-key');
    let connected = false;
    const connection = provider.connect().then(() => {
      connected = true;
    });

    socket.emit('open');
    await Promise.resolve();

    expect(socket.send).toHaveBeenCalledOnce();
    expect(JSON.parse(socket.send.mock.calls[0][0])).toMatchObject({
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        input_audio_transcription: {},
      },
    });
    expect(connected).toBe(false);

    socket.emit('message', Buffer.from('{"setupComplete":{}}'));
    await connection;
    expect(connected).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('should reject if the socket closes before setup completes', async () => {
    const socket = createMockSocket();
    const provider = new GeminiLiveTranscriptionProvider('api-key');
    const connection = provider.connect();

    socket.emit('close', 1006, Buffer.from('connection lost'));

    await expect(connection).rejects.toThrow(
      'Gemini Live connection closed before setup completed (code 1006)',
    );
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.listenerCount('open')).toBe(0);
  });

  it('should reject socket errors before setup completes', async () => {
    const socket = createMockSocket();
    const provider = new GeminiLiveTranscriptionProvider('api-key');
    const emittedError = vi.fn();
    provider.on('error', emittedError);
    const connection = provider.connect();
    const error = new Error('socket failed');

    socket.emit('error', error);

    await expect(connection).rejects.toBe(error);
    expect(emittedError).toHaveBeenCalledWith(error);
  });

  it('should reject protocol errors received during setup', async () => {
    const socket = createMockSocket();
    const provider = new GeminiLiveTranscriptionProvider('api-key');
    const emittedError = vi.fn();
    provider.on('error', emittedError);
    const connection = provider.connect();

    socket.emit('open');
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          error: {
            code: 400,
            message: 'Invalid setup',
            status: 'INVALID_ARGUMENT',
          },
        }),
      ),
    );

    await expect(connection).rejects.toThrow('Invalid setup');
    expect(emittedError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid setup' }),
    );
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('should reject and close the socket when setup times out', async () => {
    vi.useFakeTimers();
    const socket = createMockSocket();
    const provider = new GeminiLiveTranscriptionProvider('api-key');
    const connection = provider.connect();
    const connectionError = connection.catch((error: unknown) => error);

    socket.emit('open');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await connectionError).toEqual(
      expect.objectContaining({
        message: 'Gemini Live setup did not complete within 10 seconds',
      }),
    );
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.listenerCount('open')).toBe(0);
  });
});
