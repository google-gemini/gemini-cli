/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput } from './useVoiceInput.js';
import type { VoiceBackendOptions } from '@google/gemini-cli-core';

// ---------------------------------------------------------------------------
// Mock @google/gemini-cli-core: provide mock backends so tests run without
// real audio recording infrastructure (sox/arecord, Gemini API).
// ---------------------------------------------------------------------------
let capturedGeminiOptions: VoiceBackendOptions | null = null;
const mockGeminiStart = vi.fn();
const mockGeminiStop = vi.fn();

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

describe('useVoiceInput Stress Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGeminiOptions = null;
  });

  it('should not cause excessive re-renders when receiving rapid state notifications', async () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useVoiceInput({ config: mockConfig });
    });

    // Reset count after initial render
    renderCount = 0;

    await act(async () => {
      await result.current.startRecording();
    });

    const baseRenders = renderCount;

    // Simulate 100 rapid state notifications with the same value.
    // React batching should coalesce these into at most 1 additional render.
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        void capturedGeminiOptions?.onStateChange({
          isRecording: true,
          isTranscribing: false,
          error: null,
        });
      }
    });

    // 100 identical state updates should not cause 100 re-renders.
    expect(renderCount - baseRenders).toBeLessThanOrEqual(2);
  });

  it('should not cause excessive re-renders when rapid toggleRecording calls are ignored', async () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useVoiceInput({ config: mockConfig });
    });

    // Start recording
    await act(async () => {
      await result.current.startRecording();
      void capturedGeminiOptions?.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });
    });

    const rendersAfterStart = renderCount;

    // Simulate rapid toggleRecording calls while already recording.
    // The isTogglingRef guard in the hook should drop concurrent calls.
    await act(async () => {
      const calls = [];
      for (let i = 0; i < 50; i++) {
        calls.push(result.current.toggleRecording());
      }
      await Promise.all(calls);
    });

    // We expect a small, bounded number of renders — not 50.
    expect(renderCount - rendersAfterStart).toBeLessThanOrEqual(5);
  });
});
