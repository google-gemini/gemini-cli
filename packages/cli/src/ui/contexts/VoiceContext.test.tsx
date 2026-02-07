/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { VoiceContext, useVoiceContext } from './VoiceContext.js';
import type { VoiceInputReturn } from '../hooks/useVoiceInput.js';
import type React from 'react';

describe('VoiceContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should provide voice input state', () => {
    const mockVoiceInput: VoiceInputReturn = {
      state: {
        isRecording: false,
        isTranscribing: false,
        error: null,
      },
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      toggleRecording: vi.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VoiceContext.Provider value={mockVoiceInput}>
        {children}
      </VoiceContext.Provider>
    );

    const { result } = renderHook(() => useVoiceContext(), { wrapper });

    expect(result.current).toBe(mockVoiceInput);
  });
});
