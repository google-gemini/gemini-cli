/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput, onVoiceTranscript } from './useVoiceInput.js';
import type { VoiceBackendOptions } from '@google/gemini-cli-core';
import { coreEvents } from '@google/gemini-cli-core';

// ---------------------------------------------------------------------------
// Partially mock @google/gemini-cli-core: override backends, keep real
// coreEvents/CoreEvent/debugLogger so transcript events flow through properly.
// ---------------------------------------------------------------------------
const mockGeminiStart = vi.fn();
const mockGeminiStop = vi.fn();
const mockGeminiCancel = vi.fn();
const mockGeminiCleanup = vi.fn();

const mockWhisperStart = vi.fn();
const mockWhisperStop = vi.fn();
const mockWhisperCancel = vi.fn();
const mockWhisperCleanup = vi.fn();

// Captured options so tests can invoke onStateChange
let capturedGeminiOptions: VoiceBackendOptions | null = null;
let capturedWhisperOptions: VoiceBackendOptions | null = null;

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    GeminiRestBackend: vi
      .fn()
      .mockImplementation((opts: VoiceBackendOptions) => {
        capturedGeminiOptions = opts;
        return {
          start: mockGeminiStart,
          stop: mockGeminiStop,
          cancel: mockGeminiCancel,
          cleanup: mockGeminiCleanup,
        };
      }),
    LocalWhisperBackend: vi
      .fn()
      .mockImplementation((opts: VoiceBackendOptions) => {
        capturedWhisperOptions = opts;
        return {
          start: mockWhisperStart,
          stop: mockWhisperStop,
          cancel: mockWhisperCancel,
          cleanup: mockWhisperCleanup,
        };
      }),
  };
});

// Minimal mock Config with a working ContentGenerator stub
const mockConfig = {
  getContentGenerator: vi.fn().mockReturnValue({}),
} as unknown as import('@google/gemini-cli-core').Config;

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGeminiOptions = null;
    capturedWhisperOptions = null;
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));
    expect(result.current.state).toEqual({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });
  });

  it('uses GeminiRestBackend by default', () => {
    renderHook(() => useVoiceInput({ config: mockConfig }));
    expect(capturedGeminiOptions).not.toBeNull();
    expect(capturedWhisperOptions).toBeNull();
  });

  it('uses LocalWhisperBackend when provider is "whisper"', () => {
    renderHook(() =>
      useVoiceInput({ provider: 'whisper', config: mockConfig }),
    );
    expect(capturedWhisperOptions).not.toBeNull();
    expect(capturedGeminiOptions).toBeNull();
  });

  it('delegates startRecording to the active backend', async () => {
    mockGeminiStart.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));
    await act(async () => {
      await result.current.startRecording();
    });
    expect(mockGeminiStart).toHaveBeenCalledOnce();
  });

  it('delegates stopRecording to the active backend', async () => {
    mockGeminiStop.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));
    await act(async () => {
      await result.current.stopRecording();
    });
    expect(mockGeminiStop).toHaveBeenCalledOnce();
  });

  it('reflects state changes from the backend', async () => {
    mockGeminiStart.mockImplementation(async () => {
      void capturedGeminiOptions?.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });
    });

    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state.isRecording).toBe(true);
  });

  it('delivers transcript via coreEvents, not state', async () => {
    mockGeminiStop.mockImplementation(async () => {
      // Backends emit via coreEvents rather than a callback
      coreEvents.emitVoiceTranscript('Hello world');
      void capturedGeminiOptions?.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: null,
      });
    });

    const transcripts: string[] = [];
    const unsubscribe = onVoiceTranscript((t) => transcripts.push(t));

    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(transcripts).toContain('Hello world');
    expect(result.current.state).toEqual({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });

    unsubscribe();
  });

  it('surfaces errors from the backend in state', async () => {
    mockGeminiStart.mockImplementation(async () => {
      void capturedGeminiOptions?.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: 'Neither sox nor arecord found',
      });
    });

    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state.error).toContain(
      'Neither sox nor arecord found',
    );
    expect(result.current.state.isRecording).toBe(false);
  });

  it('delegates cancelRecording to the active backend', async () => {
    mockGeminiCancel.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));
    await act(async () => {
      await result.current.cancelRecording();
    });
    expect(mockGeminiCancel).toHaveBeenCalledOnce();
  });

  it('cancelRecording is a no-op when no backend is initialized', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.cancelRecording();
    });
    expect(mockGeminiCancel).not.toHaveBeenCalled();
    expect(mockWhisperCancel).not.toHaveBeenCalled();
  });
});
