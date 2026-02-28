/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamingState } from '../types.js';
import { useTimer } from './useTimer.js';
import { usePhraseCycler } from './usePhraseCycler.js';
import { useState, useEffect, useRef } from 'react';
import {
  getDisplayString,
  type RetryAttemptPayload,
} from '@google/gemini-cli-core';
import type { LoadingPhrasesMode } from '../../config/settings.js';

const LOW_VERBOSITY_RETRY_HINT_ATTEMPT_THRESHOLD = 2;

export interface UseLoadingIndicatorProps {
  streamingState: StreamingState;
  shouldShowFocusHint: boolean;
  retryStatus: RetryAttemptPayload | null;
  loadingPhrasesMode?: LoadingPhrasesMode;
  customWittyPhrases?: string[];
  errorVerbosity?: 'low' | 'full';
}

export const useLoadingIndicator = ({
  streamingState,
  shouldShowFocusHint,
  retryStatus,
  loadingPhrasesMode,
  customWittyPhrases,
  errorVerbosity = 'full',
}: UseLoadingIndicatorProps) => {
  const [timerResetKey, setTimerResetKey] = useState(0);
  const isTimerActive = streamingState === StreamingState.Responding;

  const elapsedTimeFromTimer = useTimer(isTimerActive, timerResetKey);

  const isPhraseCyclingActive = streamingState === StreamingState.Responding;
  const isWaiting = streamingState === StreamingState.WaitingForConfirmation;
  const currentLoadingPhrase = usePhraseCycler(
    isPhraseCyclingActive,
    isWaiting,
    shouldShowFocusHint,
    loadingPhrasesMode,
    customWittyPhrases,
  );

  const [retainedElapsedTime, setRetainedElapsedTime] = useState(0);
  const prevStreamingStateRef = useRef<StreamingState | null>(null);

  useEffect(() => {
    if (
      prevStreamingStateRef.current === StreamingState.WaitingForConfirmation &&
      streamingState === StreamingState.Responding
    ) {
      setTimerResetKey((prevKey) => prevKey + 1);
      setRetainedElapsedTime(0); // Clear retained time when going back to responding
    } else if (
      streamingState === StreamingState.Idle &&
      prevStreamingStateRef.current === StreamingState.Responding
    ) {
      setTimerResetKey((prevKey) => prevKey + 1); // Reset timer when becoming idle from responding
      setRetainedElapsedTime(0);
    } else if (streamingState === StreamingState.WaitingForConfirmation) {
      // Capture the time when entering WaitingForConfirmation
      // elapsedTimeFromTimer will hold the last value from when isTimerActive was true.
      setRetainedElapsedTime(elapsedTimeFromTimer);
    }

    prevStreamingStateRef.current = streamingState;
  }, [streamingState, elapsedTimeFromTimer]);

  const retryPhrase = retryStatus
    ? errorVerbosity === 'low'
      ? retryStatus.attempt >= LOW_VERBOSITY_RETRY_HINT_ATTEMPT_THRESHOLD
        ? "This is taking a bit longer, we're still on it."
        : null
      : `Trying to reach ${getDisplayString(retryStatus.model)} (Attempt ${retryStatus.attempt + 1}/${retryStatus.maxAttempts})`
    : null;

  return {
    elapsedTime:
      streamingState === StreamingState.WaitingForConfirmation
        ? retainedElapsedTime
        : elapsedTimeFromTimer,
    currentLoadingPhrase: retryPhrase || currentLoadingPhrase,
  };
};
