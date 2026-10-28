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

const LOW_VERBOSITY_RETRY_HINT_ATTEMPT_THRESHOLD = 2;

export function isRateLimitRetry(
  retryStatus: RetryAttemptPayload | null,
): boolean {
  if (!retryStatus) return false;
  if (retryStatus.status === 429) return true;
  if (!retryStatus.error) return false;
  return /429|quota|rate\s*limit|resource_exhausted/i.test(retryStatus.error);
}

export interface UseLoadingIndicatorProps {
  streamingState: StreamingState;
  shouldShowFocusHint: boolean;
  retryStatus: RetryAttemptPayload | null;
  showTips?: boolean;
  showWit?: boolean;
  customWittyPhrases?: string[];
  errorVerbosity?: 'low' | 'full';
  maxLength?: number;
  pauseUpdates?: boolean;
}

export const useLoadingIndicator = ({
  streamingState,
  shouldShowFocusHint,
  retryStatus,
  showTips = true,
  showWit = false,
  customWittyPhrases,
  errorVerbosity = 'full',
  maxLength,
  pauseUpdates = false,
}: UseLoadingIndicatorProps) => {
  const [timerResetKey, setTimerResetKey] = useState(0);
  const isTimerActive =
    streamingState === StreamingState.Responding && !pauseUpdates;

  const elapsedTimeFromTimer = useTimer(isTimerActive, timerResetKey);

  const isPhraseCyclingActive =
    streamingState === StreamingState.Responding && !pauseUpdates;
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

  const [prevRetryStatus, setPrevRetryStatus] =
    useState<RetryAttemptPayload | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const isSameRetry =
    retryStatus === prevRetryStatus ||
    (retryStatus !== null &&
      prevRetryStatus !== null &&
      retryStatus.attempt === prevRetryStatus.attempt &&
      retryStatus.delayMs === prevRetryStatus.delayMs &&
      retryStatus.model === prevRetryStatus.model);

  if (!isSameRetry) {
    setPrevRetryStatus(retryStatus);
    setCountdownSeconds(
      retryStatus ? Math.max(1, Math.round(retryStatus.delayMs / 1000)) : null,
    );
  }

  useEffect(() => {
    if (!isTimerActive || !retryStatus) {
      return;
    }

    const intervalId = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev === null || prev <= 1) {
          return 1;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [retryStatus, isTimerActive]);

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

  const isRateLimit = isRateLimitRetry(retryStatus);
  const remainingSeconds = countdownSeconds ?? 0;

  const retryPhrase =
    streamingState === StreamingState.Responding && retryStatus
      ? isRateLimit
        ? `Rate limit reached. Cooling down... Retrying in ${remainingSeconds}s (Attempt ${retryStatus.attempt}/${retryStatus.maxAttempts})`
        : errorVerbosity === 'low'
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
    currentLoadingPhrase: retryPhrase || currentTip || currentWittyPhrase,
    statusPhrase: retryPhrase ?? undefined,
    currentTip,
    currentWittyPhrase,
  };
};
