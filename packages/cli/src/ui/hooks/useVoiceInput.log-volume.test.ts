/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput } from './useVoiceInput.js';
import { debugLogger } from '@google/gemini-cli-core';
import type { VoiceBackendOptions } from '@google/gemini-cli-core';

// ---------------------------------------------------------------------------
// Mock @google/gemini-cli-core: provide mock backends so tests run without
// real audio recording infrastructure (sox/arecord, Gemini API).
// ---------------------------------------------------------------------------
let capturedGeminiOptions: VoiceBackendOptions | null = null;

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
          start: vi.fn(),
          stop: vi.fn(),
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

describe('useVoiceInput Log Volume', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedGeminiOptions = null;

    logSpy = vi.spyOn(debugLogger, 'log');
    warnSpy = vi.spyOn(debugLogger, 'warn');
    errorSpy = vi.spyOn(debugLogger, 'error');
    // We intentionally DO NOT spy on 'debug' — those logs are safe/hidden.
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should remain SILENT (no visible logs) during normal recording start/stop', async () => {
    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));

    // --- Action 1: Start Recording ---
    await act(async () => {
      await result.current.startRecording();
    });

    // Starting recording should produce ZERO visible logs.
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    // --- Action 2: Stop Recording ---
    await act(async () => {
      await result.current.stopRecording();
    });

    // Stopping should also be silent.
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should remain SILENT even when the backend emits rapid state changes', async () => {
    const { result } = renderHook(() => useVoiceInput({ config: mockConfig }));

    await act(async () => {
      await result.current.startRecording();
    });

    // Simulate the backend emitting many intermediate state notifications
    // (e.g. progress callbacks). None of these should produce visible logs.
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        void capturedGeminiOptions?.onStateChange({
          isRecording: true,
          isTranscribing: false,
          error: null,
        });
      }
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
