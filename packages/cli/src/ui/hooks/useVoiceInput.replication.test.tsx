/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, useContext, useEffect } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useVoiceInput, onVoiceTranscript } from './useVoiceInput.js';
import { VoiceContext } from '../contexts/VoiceContext.js';
import type { VoiceBackendOptions } from '@google/gemini-cli-core';
import { coreEvents } from '@google/gemini-cli-core';

// ---------------------------------------------------------------------------
// Mock @google/gemini-cli-core: provide mock backends so tests run without
// real audio recording infrastructure (sox/arecord, Gemini API).
// Keep real coreEvents so transcript events flow through properly.
// ---------------------------------------------------------------------------
let capturedGeminiOptions: VoiceBackendOptions | null = null;
const mockGeminiStart = vi.fn();
const mockGeminiStop = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  // Extend coreEvents with emitVoiceTranscript if not already present.
  const VOICE_TRANSCRIPT_EVENT = 'voice-transcript';
  const extendedCoreEvents = Object.assign(original.coreEvents, {
    emitVoiceTranscript: (transcript: string) => {
      (original.coreEvents as import('node:events').EventEmitter).emit(
        VOICE_TRANSCRIPT_EVENT,
        transcript,
      );
    },
  });
  const extendedCoreEvent = {
    ...original.CoreEvent,
    VoiceTranscript: VOICE_TRANSCRIPT_EVENT,
  };

  return {
    ...original,
    coreEvents: extendedCoreEvents,
    CoreEvent: extendedCoreEvent,
    GeminiRestBackend: vi
      .fn()
      .mockImplementation((opts: VoiceBackendOptions) => {
        capturedGeminiOptions = opts;
        return {
          start: mockGeminiStart,
          stop: mockGeminiStop,
          cleanup: vi.fn(),
        };
      }),
    LocalWhisperBackend: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      cleanup: vi.fn(),
    })),
  };
});

const mockConfig = {
  getContentGenerator: vi.fn().mockReturnValue({}),
} as unknown as import('@google/gemini-cli-core').Config;

describe('Voice Input Full Cycle Replication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGeminiOptions = null;
  });

  it('should deliver transcript via event without causing excessive re-renders', async () => {
    let consumerRenders = 0;
    let transcriptReceived: string | null = null;

    // Provider: useVoiceInput hook
    const { result: providerResult } = renderHook(() =>
      useVoiceInput({ config: mockConfig }),
    );

    // Consumer: simulates InputPrompt's event-based transcript handling
    renderHook(
      () => {
        consumerRenders++;
        useContext(VoiceContext);

        useEffect(() => {
          const unsubscribe = onVoiceTranscript((transcript) => {
            transcriptReceived = transcript;
          });
          return unsubscribe;
        }, []);
      },
      {
        wrapper: ({ children }) => (
          <VoiceContext.Provider value={providerResult.current}>
            {children}
          </VoiceContext.Provider>
        ),
      },
    );

    // Reset render counter after initial setup
    consumerRenders = 0;

    // Step 1: Start recording
    await act(async () => {
      await providerResult.current.toggleRecording();
      void capturedGeminiOptions?.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });
    });

    const rendersBefore = consumerRenders;

    // Step 2: Stop recording — backend emits transcript via coreEvents
    await act(async () => {
      await providerResult.current.toggleRecording();
      void capturedGeminiOptions?.onStateChange({
        isRecording: false,
        isTranscribing: true,
        error: null,
      });
      // Simulate backend emitting transcript after transcription completes
      coreEvents.emitVoiceTranscript('this is a test');
      void capturedGeminiOptions?.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: null,
      });
    });

    // Wait for transcript event to propagate without using fixed timeouts
    await waitFor(() => {
      expect(transcriptReceived).toBe('this is a test');
    });

    // With event-based delivery, the consumer renders very few times.
    // It should not re-render for every state change in the backend.
    const rendersAfter = consumerRenders;
    expect(rendersAfter - rendersBefore).toBeLessThan(5);
  });
});
