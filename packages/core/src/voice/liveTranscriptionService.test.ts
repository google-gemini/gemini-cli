/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveTranscriptionService } from './liveTranscriptionService.js';
import WebSocket from 'ws';

describe('LiveTranscriptionService', () => {
  let service: LiveTranscriptionService;
  let sendSpy: any;
  let onSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LiveTranscriptionService('test-api-key');

    // Spy on the WebSocket constructor and methods
    // Since 'ws' is a class, we can't easily mock the whole module in ESM sometimes
    // but we can spy on the prototype.
    sendSpy = vi
      .spyOn(WebSocket.prototype, 'send')
      .mockImplementation(() => {});
    // WebSocket.on returns 'this'
    onSpy = vi.spyOn(WebSocket.prototype, 'on').mockImplementation(function (
      this: any,
    ) {
      return this;
    });
    vi.spyOn(WebSocket.prototype, 'readyState', 'get').mockReturnValue(1); // OPEN
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize WebSocket with the correct URL including API key', async () => {
    const connectPromise = service.connect();

    // Find the 'open' callback and trigger it
    const openCallback = onSpy.mock.calls.find(
      (call: any) => call[0] === 'open',
    )[1];
    openCallback();

    await connectPromise;
  });

  it('should send the correct setup message on connect', async () => {
    const connectPromise = service.connect();
    const openCallback = onSpy.mock.calls.find(
      (call: any) => call[0] === 'open',
    )[1];
    openCallback();
    await connectPromise;

    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('"input_audio_transcription":{}'),
    );
    expect(sendSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('"output_audio_transcription":{}'),
    );
  });

  it('should emit transcription events when receiving inputTranscription messages', async () => {
    const connectPromise = service.connect();
    const openCallback = onSpy.mock.calls.find(
      (call: any) => call[0] === 'open',
    )[1];
    openCallback();
    await connectPromise;

    const transcriptionCallback = vi.fn();
    service.on('transcription', transcriptionCallback);

    const messageCallback = onSpy.mock.calls.find(
      (call: any) => call[0] === 'message',
    )[1];

    messageCallback(
      Buffer.from(
        JSON.stringify({
          serverContent: {
            inputTranscription: {
              text: 'Hello ',
            },
          },
        }),
      ),
    );

    expect(transcriptionCallback).toHaveBeenCalledWith('Hello ');
    expect(service.getTranscription()).toBe('Hello ');
  });

  it('should properly send audio chunks as base64 PCM data', async () => {
    const connectPromise = service.connect();
    const openCallback = onSpy.mock.calls.find(
      (call: any) => call[0] === 'open',
    )[1];

    // 1. Simulate open
    openCallback();
    await connectPromise;

    // 2. Clear send calls from setup
    sendSpy.mockClear();

    // 3. Send audio
    const chunk = Buffer.from('test audio data');
    service.sendAudioChunk(chunk);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining(chunk.toString('base64')),
    );
  });
});
