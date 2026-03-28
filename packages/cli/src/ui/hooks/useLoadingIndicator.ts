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

/**
 * Returns true if the model name looks like a Pro model.
 * Avoids importing core model utilities into UI code.
 */
function isLikelyProModel(model: string): boolean {
  return model.toLowerCase().includes('pro');
}

/**
 * Formats a delay in milliseconds as a short human-readable string.
 * e.g. 4500 → "5s", 65000 → "1m 5s"
 */
function formatRetryDelay(delayMs: number): string {
  const totalSeconds = Math.ceil(delayMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Builds a contextual retry message based on error type and model.
 * For quota/capacity errors on Pro models, provides actionable guidance.
 */
function buildRetryPhrase(
  retryStatus: RetryAttemptPayload,
  errorVerbosity: 'low' | 'full',
): string | null {
  const { attempt, maxAttempts, delayMs, errorCode, model } = retryStatus;
  const isQuotaError = errorCode === 'QUOTA_EXCEEDED';
  const isProModelUsed = isLikelyProModel(model);
  const attemptStr = `Attempt ${attempt + 1}/${maxAttempts}`;

  if (errorVerbosity === 'low') {
    if (attempt < LOW_VERBOSITY_RETRY_HINT_ATTEMPT_THRESHOLD) {
      return null;
    }
    if (isQuotaError && isProModelUsed) {
      return 'Pro model is at capacity. Try /model flash to switch, or wait.';
    }
    return "This is taking a bit longer, we're still on it.";
  }

  // Full verbosity: contextual, actionable messages.
  const modelName = getDisplayString(model);
  const delayStr = formatRetryDelay(delayMs);
  if (isQuotaError && isProModelUsed) {
    return `${modelName} is at capacity — retrying in ${delayStr} (${attemptStr}) · try /model flash to switch`;
  }

  return `Trying to reach ${modelName} — retrying in ${delayStr} (${attemptStr})`;
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

  const retryPhrase = retryStatus
    ? buildRetryPhrase(retryStatus, errorVerbosity)
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
