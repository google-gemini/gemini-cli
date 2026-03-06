/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef } from 'react';
import { StreamingState, type HistoryItemWithoutId } from '../types.js';
import { AudioEvent, AudioNotificationService } from '@google/gemini-cli-core';

interface AudioNotificationParams {
  enabled: boolean;
  streamingState: StreamingState;
  hasPendingActionRequired: boolean;
  pendingHistoryItems: HistoryItemWithoutId[];
}

export function useAudioNotifications({
  enabled,
  streamingState,
  hasPendingActionRequired,
  pendingHistoryItems,
}: AudioNotificationParams): void {
  const previousStreamingStateRef = useRef(streamingState);
  const audioServiceRef = useRef(new AudioNotificationService(enabled));

  // Update enablement if settings change
  useEffect(() => {
    // Note: We create a new instance only if enabled state changes.
    // In practice, since AudioNotificationService just holds a boolean,
    // we could also just update a setter if we had one.
    audioServiceRef.current = new AudioNotificationService(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const previousStreamingState = previousStreamingStateRef.current;
    previousStreamingStateRef.current = streamingState;

    const justCompletedTurn =
      previousStreamingState === StreamingState.Responding &&
      streamingState === StreamingState.Idle;

    const justStartedTurn =
      previousStreamingState === StreamingState.Idle &&
      streamingState === StreamingState.Responding;

    // Play processing start sound
    if (justStartedTurn) {
      void audioServiceRef.current.play(AudioEvent.PROCESSING_START);
      return;
    }

    // Play completion sound if task finished successfully without pending actions
    if (justCompletedTurn && !hasPendingActionRequired) {
      // Check if the last item in pendingHistoryItems is an error message
      const lastItem = pendingHistoryItems[pendingHistoryItems.length - 1];
      const isError = lastItem?.type === 'error';

      if (isError) {
        void audioServiceRef.current.play(AudioEvent.ERROR);
      } else {
        void audioServiceRef.current.play(AudioEvent.SUCCESS);
      }
    }
  }, [streamingState, enabled, hasPendingActionRequired, pendingHistoryItems]);
}
