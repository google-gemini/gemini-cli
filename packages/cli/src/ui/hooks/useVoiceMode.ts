/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  AudioRecorder,
  TranscriptionFactory,
  debugLogger,
  type Config,
  type TranscriptionProvider,
} from '@google/gemini-cli-core';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { MergedSettings } from '../../config/settingsSchema.js';
import type { Key } from './useKeypress.js';
import { Command } from '../key/keyMatchers.js';

interface UseVoiceModeProps {
  buffer: TextBuffer;
  config: Config;
  settings: MergedSettings;
  setQueueErrorMessage: (message: string | null) => void;
  isVoiceModeEnabled: boolean;
  setVoiceModeEnabled: (enabled: boolean) => void;
  keyMatchers: Record<Command, (key: Key) => boolean>;
}

const HOLD_DELAY_MS = 600;
const RELEASE_DELAY_MS = 300;

export function useVoiceMode({
  buffer,
  config,
  settings,
  setQueueErrorMessage,
  isVoiceModeEnabled,
  setVoiceModeEnabled,
  keyMatchers,
}: UseVoiceModeProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const liveTranscriptionRef = useRef('');
  const stopRequestedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const lastFailureTimeRef = useRef(0);
  const recordingInProgressRef = useRef(false);
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const transcriptionServiceRef = useRef<TranscriptionProvider | null>(null);
  const turnBaselineRef = useRef<string | null>(null);
  const turnBaselineCursorOffsetRef = useRef<number>(0);

  const pttStateRef = useRef<'idle' | 'possible-hold' | 'recording'>('idle');
  const pttTimerRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;

  const stopVoiceRecording = useCallback(() => {
    if (stopRequestedRef.current) return;
    debugLogger.debug('[Voice] Stop requested');
    stopRequestedRef.current = true;

    setIsRecording(false);
    isRecordingRef.current = false;
    setIsConnecting(false);

    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    const serviceToDisconnect = transcriptionServiceRef.current;
    transcriptionServiceRef.current = null;

    if (serviceToDisconnect) {
      const isLive = settings.experimental.voice?.backend === 'gemini-live';
      const gracePeriodMs =
        settings.experimental.voice?.stopGracePeriodMs ??
        (isLive ? 2000 : 1000);
      debugLogger.debug(
        `[Voice] Draining transcription for ${gracePeriodMs}ms`,
      );

      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        debugLogger.debug('[Voice] Grace period ended, disconnecting service');
        serviceToDisconnect.disconnect();
        disconnectTimerRef.current = null;
      }, gracePeriodMs);
    }

    liveTranscriptionRef.current = '';
    pttStateRef.current = 'idle';
  }, [settings.experimental.voice]);

  const startVoiceRecording = useCallback(() => {
    if (
      isRecordingRef.current ||
      Date.now() - lastFailureTimeRef.current < 2000
    ) {
      return;
    }

    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    recordingInProgressRef.current = true;
    turnBaselineRef.current = bufferRef.current.text;
    turnBaselineCursorOffsetRef.current = bufferRef.current.getOffset();

    setIsConnecting(true);
    setIsRecording(true);
    isRecordingRef.current = true;

    liveTranscriptionRef.current = '';
    stopRequestedRef.current = false;

    const apiKey =
      config.getContentGeneratorConfig()?.apiKey ||
      process.env['GEMINI_API_KEY'] ||
      '';

    const startAsync = async () => {
      // If there's an active draining service, disconnect it immediately
      // before starting a new one to prevent orphaned event collisions.
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      if (transcriptionServiceRef.current) {
        transcriptionServiceRef.current.disconnect();
        transcriptionServiceRef.current = null;
      }

      const cleanupIfStopped = () => {
        if (stopRequestedRef.current) {
          if (recorderRef.current) {
            recorderRef.current.stop();
            recorderRef.current = null;
          }
          if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.disconnect();
            transcriptionServiceRef.current = null;
          }
          setIsRecording(false);
          isRecordingRef.current = false;
          setIsConnecting(false);
          recordingInProgressRef.current = false;
          return true;
        }
        return false;
      };

      if (cleanupIfStopped()) return;

      const voiceBackend =
        settings.experimental.voice?.backend ?? 'gemini-live';

      if (!apiKey && voiceBackend === 'gemini-live') {
        setQueueErrorMessage(
          'Cloud voice mode requires a GEMINI_API_KEY. Please set it in your environment or ~/.gemini/.env.',
        );
        setIsRecording(false);
        isRecordingRef.current = false;
        setIsConnecting(false);
        recordingInProgressRef.current = false;
        lastFailureTimeRef.current = Date.now();
        return;
      }

      if (voiceBackend === 'gemini-live') {
        recorderRef.current = new AudioRecorder();
      }

      const currentService = TranscriptionFactory.createProvider(
        settings.experimental.voice,
        apiKey,
      );
      transcriptionServiceRef.current = currentService;

      currentService.on('transcription', (text) => {
        if (
          transcriptionServiceRef.current !== currentService &&
          stopRequestedRef.current
        ) {
          // If this is an orphaned service that was replaced by a new session, ignore its events
          return;
        }

        if (text) {
          const baseline = turnBaselineRef.current ?? '';
          const insertOffset = turnBaselineCursorOffsetRef.current;
          const textBefore = baseline.slice(0, insertOffset);
          const textAfter = baseline.slice(insertOffset);

          const prefix =
            textBefore.length > 0 && !/\s$/.test(textBefore)
              ? textBefore + ' '
              : textBefore;

          const suffix =
            text.length > 0 && textAfter.length > 0 && !/^\s/.test(textAfter)
              ? ' '
              : '';

          const newTotalText = prefix + text + suffix + textAfter;
          bufferRef.current.setText(newTotalText, prefix.length + text.length);
        }
        liveTranscriptionRef.current = text;
      });

      currentService.on('turnComplete', () => {
        if (
          transcriptionServiceRef.current !== currentService &&
          stopRequestedRef.current
        )
          return;
        // Advance the baseline so subsequent turns append after this turn's text
        turnBaselineRef.current = bufferRef.current.text;
        turnBaselineCursorOffsetRef.current = bufferRef.current.getOffset();
        liveTranscriptionRef.current = '';
      });

      currentService.on('error', (err) => {
        if (transcriptionServiceRef.current !== currentService) return;
        debugLogger.error('[Voice] Transcription error:', err);
        lastFailureTimeRef.current = Date.now();
        recordingInProgressRef.current = false;
      });

      currentService.on('close', () => {
        if (transcriptionServiceRef.current !== currentService) return;
        if (!stopRequestedRef.current) {
          setIsRecording(false);
          isRecordingRef.current = false;
          setIsConnecting(false);
          recordingInProgressRef.current = false;
          lastFailureTimeRef.current = Date.now();
        }
      });

      try {
        await currentService.connect();
        if (cleanupIfStopped()) return;

        await recorderRef.current?.start();
        if (cleanupIfStopped()) return;

        setIsConnecting(false);

        const currentVoiceBackend =
          settings.experimental.voice?.backend ?? 'gemini-live';

        recorderRef.current?.on('data', (chunk) => {
          if (currentVoiceBackend === 'gemini-live') {
            currentService.sendAudioChunk(chunk);
          }
        });
        recorderRef.current?.on('error', (err) => {
          debugLogger.error('[Voice] Recorder error:', err);
          stopVoiceRecording();
          lastFailureTimeRef.current = Date.now();
        });
      } catch (err: unknown) {
        if (transcriptionServiceRef.current !== currentService) return;
        const message = err instanceof Error ? err.message : String(err);
        setQueueErrorMessage(`Voice mode failure: ${message}`);
        setIsRecording(false);
        isRecordingRef.current = false;
        setIsConnecting(false);
        recordingInProgressRef.current = false;
        lastFailureTimeRef.current = Date.now();

        if (recorderRef.current) {
          recorderRef.current.stop();
          recorderRef.current = null;
        }
        if (transcriptionServiceRef.current) {
          transcriptionServiceRef.current.disconnect();
          transcriptionServiceRef.current = null;
        }
      }
    };

    void startAsync();
  }, [
    config,
    settings.experimental.voice,
    setQueueErrorMessage,
    stopVoiceRecording,
  ]);

  useEffect(
    () => () => {
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      if (recorderRef.current) {
        recorderRef.current.stop();
        recorderRef.current = null;
      }
      if (transcriptionServiceRef.current) {
        transcriptionServiceRef.current.disconnect();
        transcriptionServiceRef.current = null;
      }
      if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    },
    [],
  );

  const handleVoiceInput = useCallback(
    (key: Key): boolean => {
      const activeRecording = isRecording || isRecordingRef.current;

      if (activeRecording) {
        const activationMode =
          settings.experimental.voice?.activationMode ?? 'push-to-talk';

        if (keyMatchers[Command.ESCAPE](key)) {
          stopVoiceRecording();
          return true;
        }

        if (keyMatchers[Command.VOICE_MODE_PTT](key)) {
          if (activationMode === 'push-to-talk') {
            if (pttTimerRef.current) {
              clearTimeout(pttTimerRef.current);
            }
            pttTimerRef.current = setTimeout(() => {
              stopVoiceRecording();
              pttTimerRef.current = null;
            }, RELEASE_DELAY_MS);
            return true;
          } else {
            stopVoiceRecording();
            return true;
          }
        }
        return true;
      }

      if (isVoiceModeEnabled) {
        const activationMode =
          settings.experimental.voice?.activationMode ?? 'push-to-talk';

        if (keyMatchers[Command.ESCAPE](key) && buffer.text === '') {
          setVoiceModeEnabled(false);
          return true;
        }

        if (keyMatchers[Command.VOICE_MODE_PTT](key)) {
          if (
            key.name === 'space' &&
            !key.ctrl &&
            !key.alt &&
            !key.shift &&
            !key.cmd
          ) {
            if (activationMode === 'toggle') {
              startVoiceRecording();
              return true;
            } else {
              if (pttStateRef.current === 'idle') {
                buffer.insert(' ');
                pttStateRef.current = 'possible-hold';

                if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
                pttTimerRef.current = setTimeout(() => {
                  pttStateRef.current = 'idle';
                  pttTimerRef.current = null;
                }, HOLD_DELAY_MS);
                return true;
              } else if (pttStateRef.current === 'possible-hold') {
                if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
                buffer.backspace();
                pttStateRef.current = 'recording';
                startVoiceRecording();

                pttTimerRef.current = setTimeout(() => {
                  stopVoiceRecording();
                  pttTimerRef.current = null;
                }, RELEASE_DELAY_MS);
                return true;
              }
            }
          }
        }

        if (pttStateRef.current === 'possible-hold') {
          pttStateRef.current = 'idle';
          if (pttTimerRef.current) {
            clearTimeout(pttTimerRef.current);
            pttTimerRef.current = null;
          }
        }
      }

      return false;
    },
    [
      isRecording,
      isVoiceModeEnabled,
      settings.experimental.voice,
      keyMatchers,
      stopVoiceRecording,
      startVoiceRecording,
      buffer,
      setVoiceModeEnabled,
    ],
  );

  return {
    isRecording,
    isConnecting,
    startVoiceRecording,
    stopVoiceRecording,
    handleVoiceInput,
    resetTurnBaseline: () => {
      turnBaselineRef.current = null;
    },
  };
}
