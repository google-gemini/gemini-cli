/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  debugLogger,
  coreEvents,
  CoreEvent,
  GeminiRestBackend,
  LocalWhisperBackend,
} from '@google/gemini-cli-core';
import type {
  VoiceBackend,
  VoiceInputState,
  Config,
} from '@google/gemini-cli-core';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

export type {
  VoiceInputState,
  VoiceBackend,
  VoiceInputReturn,
} from '@google/gemini-cli-core';

/**
 * Subscribe to voice transcript events emitted by the active backend.
 * Uses the coreEvents bus (CoreEvent.VoiceTranscript) to avoid React
 * re-render cascades.
 */
export function onVoiceTranscript(
  callback: (transcript: string) => void,
): () => void {
  coreEvents.on(CoreEvent.VoiceTranscript, callback);
  return () => {
    coreEvents.off(CoreEvent.VoiceTranscript, callback);
  };
}

export interface VoiceInputConfig {
  /**
   * Which transcription backend to use.
   * - 'gemini' (default): zero-install, uses the CLI's existing Gemini API auth.
   * - 'whisper': local Whisper binary (faster-whisper or openai-whisper).
   */
  provider?: 'gemini' | 'whisper';
  /** Path to a custom Whisper binary. Only used when provider is 'whisper'. */
  whisperPath?: string;
  /** The CLI Config instance, used by the Gemini backend for auth. */
  config: Config;
  /**
   * RMS energy threshold for silence detection (0–1000). Audio below this
   * level is discarded without an API call. 0 disables silence detection.
   * Default: 80 (allows whispered speech in quiet environments).
   */
  silenceThreshold?: number;
}

/**
 * Hook for voice input using system audio recording and a pluggable
 * transcription backend (from packages/core).
 *
 * Backends:
 * - GeminiRestBackend (default): records raw PCM in-memory, builds a WAV
 *   buffer, and transcribes via the Gemini API using the CLI's existing
 *   ContentGenerator. Works with both API key and OAuth auth.
 * - LocalWhisperBackend: records a WAV file and transcribes with a locally
 *   installed Whisper binary. Used when provider is set to 'whisper'.
 *
 * Transcripts are delivered via CoreEvent.VoiceTranscript on coreEvents.
 */
export function useVoiceInput(voiceConfig?: VoiceInputConfig) {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    error: null,
  });

  const backendRef = useRef<VoiceBackend | null>(null);
  const isTogglingRef = useRef(false);

  // Initialize (or re-initialize) the backend when config changes
  useEffect(() => {
    const options = {
      onStateChange: async (newState: VoiceInputState) => {
        setState(newState);
        if (newState.error) {
          coreEvents.emitFeedback('error', newState.error);
        }
        // Yield one macrotask after signalling isTranscribing:true so Ink
        // can flush the state update and render ⏳ before the network call.
        if (newState.isTranscribing) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      },
      silenceThreshold: voiceConfig?.silenceThreshold,
    };

    if (voiceConfig?.provider === 'whisper') {
      backendRef.current = new LocalWhisperBackend(options, {
        whisperPath: voiceConfig.whisperPath,
      });
    } else if (voiceConfig?.config) {
      backendRef.current = new GeminiRestBackend(options, voiceConfig.config);
    }

    return () => {
      void backendRef.current?.cleanup();
      backendRef.current = null;
    };
  }, [
    voiceConfig?.provider,
    voiceConfig?.whisperPath,
    voiceConfig?.config,
    voiceConfig?.silenceThreshold,
  ]);

  const startRecording = useCallback(async () => {
    if (!backendRef.current) {
      debugLogger.debug(
        'useVoiceInput: startRecording — no backend (voice disabled?)',
      );
      return;
    }
    debugLogger.debug('useVoiceInput: startRecording');
    await backendRef.current.start();
  }, []);

  const stopRecording = useCallback(async () => {
    if (!backendRef.current) return;
    debugLogger.debug('useVoiceInput: stopRecording');
    await backendRef.current.stop();
  }, []);

  const cancelRecording = useCallback(async () => {
    if (!backendRef.current) return;
    await backendRef.current.cancel();
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;
    try {
      if (state.isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (e) {
      debugLogger.error('useVoiceInput: toggle error', e);
    } finally {
      isTogglingRef.current = false;
    }
  }, [state.isRecording, startRecording, stopRecording]);

  const isEnabled = !!(
    voiceConfig?.config || voiceConfig?.provider === 'whisper'
  );

  return useMemo(
    () => ({
      isEnabled,
      state,
      startRecording,
      stopRecording,
      cancelRecording,
      toggleRecording,
    }),
    [
      isEnabled,
      state,
      startRecording,
      stopRecording,
      cancelRecording,
      toggleRecording,
    ],
  );
}
