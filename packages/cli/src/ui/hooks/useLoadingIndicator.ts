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

const MODEL_CAPACITY_EXHAUSTED_PATTERN =
  /MODEL_CAPACITY_EXHAUSTED|no capacity available/i;
const NETWORK_STALL_PATTERN =
  /ETIMEDOUT|timed out|ECONNRESET|socket hang up|UND_ERR_(CONNECT|HEADERS|BODY)_TIMEOUT/i;

export interface UseLoadingIndicatorProps {
  streamingState: StreamingState;
  shouldShowFocusHint: boolean;
  retryStatus: RetryAttemptPayload | null;
  showTips?: boolean;
  showWit?: boolean;
  customWittyPhrases?: string[];
  errorVerbosity?: 'low' | 'full';
  maxLength?: number;
}

export const useLoadingIndicator = ({
  streamingState,
  shouldShowFocusHint,
  retryStatus,
  showTips = true,
  showWit = false,
  customWittyPhrases,
  maxLength,
}: UseLoadingIndicatorProps) => {
  const [timerResetKey, setTimerResetKey] = useState(0);
  const isTimerActive = streamingState === StreamingState.Responding;

  const elapsedTimeFromTimer = useTimer(isTimerActive, timerResetKey);

  const isPhraseCyclingActive = streamingState === StreamingState.Responding;
  const isWaiting = streamingState === StreamingState.WaitingForConfirmation;

  const { currentTip, currentWittyPhrase } = usePhraseCycler(
    isPhraseCyclingActive,
    isWaiting,
    shouldShowFocusHint,
    showTips,
    showWit,
    customWittyPhrases,
    maxLength,
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

  const isModelCapacityRetry =
    retryStatus?.error !== undefined &&
    MODEL_CAPACITY_EXHAUSTED_PATTERN.test(retryStatus.error);
  const isNetworkStallRetry =
    retryStatus?.error !== undefined &&
    NETWORK_STALL_PATTERN.test(retryStatus.error);

  const retryPhrase =
    streamingState === StreamingState.Responding && retryStatus
      ? isModelCapacityRetry
        ? `Model capacity exhausted. Retrying (attempt ${retryStatus.attempt + 1})...`
        : isNetworkStallRetry
          ? `Request timed out. Retrying (attempt ${retryStatus.attempt + 1})...`
          : `Trying to reach ${getDisplayString(retryStatus.model)} (Attempt ${retryStatus.attempt + 1}/${retryStatus.maxAttempts})`
      : null;

  return {
    elapsedTime:
      streamingState === StreamingState.WaitingForConfirmation
        ? retainedElapsedTime
        : elapsedTimeFromTimer,
    currentLoadingPhrase: retryPhrase || currentTip || currentWittyPhrase,
    currentTip,
    currentWittyPhrase,
  };
};
