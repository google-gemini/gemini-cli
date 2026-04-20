/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceSession } from '../voiceSession.js';
import { VoiceState, VoiceEvent } from '../types.js';
import type {
  STTProvider,
  TTSProvider,
  TranscriptResult,
  VoiceCommand,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------

function createMockSTTProvider(): STTProvider & {
  _transcriptHandler: ((result: TranscriptResult) => void) | null;
  _emitTranscript: (result: TranscriptResult) => void;
} {
  let handler: ((result: TranscriptResult) => void) | null = null;

  return {
    _transcriptHandler: null,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onTranscript: vi.fn((h: (result: TranscriptResult) => void) => {
      handler = h;
    }),
    isListening: vi.fn().mockReturnValue(false),
    feedAudio: vi.fn(),
    _emitTranscript(result: TranscriptResult) {
      handler?.(result);
    },
    get _handler() {
      return handler;
    },
  };
}

function createMockTTSProvider(): TTSProvider & {
  _finishHandler: (() => void) | null;
  _emitFinish: () => void;
} {
  let handler: (() => void) | null = null;

  return {
    _finishHandler: null,
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isSpeaking: vi.fn().mockReturnValue(false),
    onFinish: vi.fn((h: () => void) => {
      handler = h;
    }),
    _emitFinish() {
      handler?.();
    },
    get _handler() {
      return handler;
    },
  };
}

describe('VoiceSession', () => {
  let sttProvider: ReturnType<typeof createMockSTTProvider>;
  let ttsProvider: ReturnType<typeof createMockTTSProvider>;
  let session: VoiceSession;

  beforeEach(() => {
    sttProvider = createMockSTTProvider();
    ttsProvider = createMockTTSProvider();
    session = new VoiceSession({
      sttProvider,
      ttsProvider,
      config: {
        sampleRate: 16000,
        wakeWord: 'Hey Gemini',
      },
    });
  });

  describe('lifecycle', () => {
    it('should start in Idle state', () => {
      expect(session.state).toBe(VoiceState.Idle);
    });

    it('should transition to Listening on start', async () => {
      await session.start();
      expect(session.state).toBe(VoiceState.Listening);
      expect(sttProvider.start).toHaveBeenCalled();
    });

    it('should not start if already started', async () => {
      await session.start();
      await session.start();
      // start() on the STT provider should only be called once.
      expect(sttProvider.start).toHaveBeenCalledTimes(1);
    });

    it('should transition to Idle on stop', async () => {
      await session.start();
      await session.stop();
      expect(session.state).toBe(VoiceState.Idle);
      expect(sttProvider.stop).toHaveBeenCalled();
      expect(ttsProvider.stop).toHaveBeenCalled();
    });
  });

  describe('command handling', () => {
    it('should invoke the command handler when a final transcript arrives', async () => {
      const commandHandler = vi.fn();
      session.onCommand(commandHandler);

      await session.start();

      // Simulate a final transcript.
      sttProvider._emitTranscript({
        text: 'show me the tools',
        confidence: 0.95,
        isFinal: true,
        language: 'en-US',
      });

      expect(commandHandler).toHaveBeenCalledTimes(1);
      const command: VoiceCommand = commandHandler.mock.calls[0][0];
      expect(command.type).toBe('slash');
      expect(command.value).toBe('/tools');
    });

    it('should treat unrecognized speech as a prompt', async () => {
      const commandHandler = vi.fn();
      session.onCommand(commandHandler);

      await session.start();

      sttProvider._emitTranscript({
        text: 'explain quantum computing',
        confidence: 0.9,
        isFinal: true,
        language: 'en-US',
      });

      expect(commandHandler).toHaveBeenCalledTimes(1);
      const command: VoiceCommand = commandHandler.mock.calls[0][0];
      expect(command.type).toBe('prompt');
      expect(command.value).toBe('explain quantum computing');
    });

    it('should not invoke handler for partial transcripts', async () => {
      const commandHandler = vi.fn();
      session.onCommand(commandHandler);

      await session.start();

      sttProvider._emitTranscript({
        text: 'show me',
        confidence: 0.5,
        isFinal: false,
        language: 'en-US',
      });

      expect(commandHandler).not.toHaveBeenCalled();
    });

    it('should ignore empty final transcripts', async () => {
      const commandHandler = vi.fn();
      session.onCommand(commandHandler);

      await session.start();

      sttProvider._emitTranscript({
        text: '   ',
        confidence: 0.9,
        isFinal: true,
        language: 'en-US',
      });

      expect(commandHandler).not.toHaveBeenCalled();
    });
  });

  describe('wake word mode', () => {
    let wakeWordSession: VoiceSession;

    beforeEach(() => {
      sttProvider = createMockSTTProvider();
      ttsProvider = createMockTTSProvider();
      wakeWordSession = new VoiceSession({
        sttProvider,
        ttsProvider,
        requireWakeWord: true,
        config: {
          wakeWord: 'Hey Gemini',
        },
      });
    });

    it('should ignore transcripts without the wake word', async () => {
      const commandHandler = vi.fn();
      wakeWordSession.onCommand(commandHandler);

      await wakeWordSession.start();

      sttProvider._emitTranscript({
        text: 'show me the tools',
        confidence: 0.9,
        isFinal: true,
        language: 'en-US',
      });

      expect(commandHandler).not.toHaveBeenCalled();
    });

    it('should process commands after wake word detection', async () => {
      const commandHandler = vi.fn();
      wakeWordSession.onCommand(commandHandler);

      await wakeWordSession.start();

      sttProvider._emitTranscript({
        text: 'Hey Gemini show me the tools',
        confidence: 0.9,
        isFinal: true,
        language: 'en-US',
      });

      expect(commandHandler).toHaveBeenCalledTimes(1);
      const command: VoiceCommand = commandHandler.mock.calls[0][0];
      expect(command.type).toBe('slash');
      expect(command.value).toBe('/tools');
    });

    it('should emit WakeWordDetected event', async () => {
      const eventHandler = vi.fn();
      wakeWordSession.on(VoiceEvent.WakeWordDetected, eventHandler);

      await wakeWordSession.start();

      sttProvider._emitTranscript({
        text: 'Hey Gemini help me',
        confidence: 0.9,
        isFinal: true,
        language: 'en-US',
      });

      expect(eventHandler).toHaveBeenCalledWith('hey gemini');
    });
  });

  describe('TTS', () => {
    it('should transition to Speaking state when speak() is called', async () => {
      await session.start();
      // Delay the speak resolution so we can check state.
      ttsProvider.speak = vi.fn().mockReturnValue(new Promise(() => {}));

      const speakPromise = session.speak('Hello world');
      expect(session.state).toBe(VoiceState.Speaking);

      // We don't await speakPromise since it never resolves in this test.
      void speakPromise;
    });

    it('should emit TTSStart event when speaking', async () => {
      const eventHandler = vi.fn();
      session.on(VoiceEvent.TTSStart, eventHandler);

      await session.start();
      ttsProvider.speak = vi.fn().mockResolvedValue(undefined);

      await session.speak('Hello');
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('configuration', () => {
    it('should merge config with defaults', () => {
      const config = session.getConfig();
      expect(config.sampleRate).toBe(16000);
      expect(config.wakeWord).toBe('Hey Gemini');
      // Defaults that were not overridden.
      expect(config.language).toBe('en-US');
      expect(config.sttProvider).toBe('external');
      expect(config.ttsProvider).toBe('system');
      expect(config.silenceThresholdMs).toBe(1500);
    });
  });

  describe('audio level', () => {
    it('should return 0 when not capturing', () => {
      expect(session.getAudioLevel()).toBe(0);
    });
  });
});
