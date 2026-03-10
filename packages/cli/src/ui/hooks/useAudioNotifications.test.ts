/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { renderHook } from '../../test-utils/render.js';
import { useAudioNotifications } from './useAudioNotifications.js';
import { StreamingState, type HistoryItemWithoutId } from '../types.js';
import { AudioNotificationService, AudioEvent } from '@google/gemini-cli-core';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const playSpy = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    AudioEvent: {
      SUCCESS: 'SUCCESS',
      ERROR: 'ERROR',
      PROCESSING_START: 'PROCESSING_START',
    },
    AudioNotificationService: vi.fn().mockImplementation(() => ({
      play: playSpy,
    })),
  };
});

describe('useAudioNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playSpy.mockClear();
  });

  it('should not play audio if disabled', () => {
    renderHook(() =>
      useAudioNotifications({
        enabled: false,
        streamingState: StreamingState.Responding,
        hasPendingActionRequired: false,
        pendingHistoryItems: [] as HistoryItemWithoutId[],
      }),
    );
    expect(AudioNotificationService).toHaveBeenCalledWith(false);
  });

  it('plays PROCESSING_START when transitioning from Idle to Responding', () => {
    const { rerender } = renderHook((props) => useAudioNotifications(props), {
      initialProps: {
        enabled: true,
        streamingState: StreamingState.Idle,
        hasPendingActionRequired: false,
        pendingHistoryItems: [] as HistoryItemWithoutId[],
      },
    });

    rerender({
      enabled: true,
      streamingState: StreamingState.Responding,
      hasPendingActionRequired: false,
      pendingHistoryItems: [],
    });

    expect(playSpy).toHaveBeenCalledWith(AudioEvent.PROCESSING_START);
  });

  it('plays SUCCESS when transitioning from Responding to Idle without errors', () => {
    const { rerender } = renderHook((props) => useAudioNotifications(props), {
      initialProps: {
        enabled: true,
        streamingState: StreamingState.Responding,
        hasPendingActionRequired: false,
        pendingHistoryItems: [] as HistoryItemWithoutId[],
      },
    });

    rerender({
      enabled: true,
      streamingState: StreamingState.Idle,
      hasPendingActionRequired: false,
      pendingHistoryItems: [
        { type: 'info', text: 'hello' } as HistoryItemWithoutId,
      ],
    });

    expect(playSpy).toHaveBeenCalledWith(AudioEvent.SUCCESS);
  });

  it('plays ERROR when transitioning from Responding to Idle with errors', () => {
    const { rerender } = renderHook((props) => useAudioNotifications(props), {
      initialProps: {
        enabled: true,
        streamingState: StreamingState.Responding,
        hasPendingActionRequired: false,
        pendingHistoryItems: [] as HistoryItemWithoutId[],
      },
    });

    rerender({
      enabled: true,
      streamingState: StreamingState.Idle,
      hasPendingActionRequired: false,
      pendingHistoryItems: [
        {
          type: 'error',
          text: 'Error occurred',
        } as HistoryItemWithoutId,
      ],
    });

    expect(playSpy).toHaveBeenCalledWith(AudioEvent.ERROR);
  });
});
