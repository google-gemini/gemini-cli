/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdout } from 'ink';
import { useSettings } from '../contexts/SettingsContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { debugLogger } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';

export const useBell = () => {
  const { stdout } = useStdout();
  const { merged: settings } = useSettings();
  const { dialogsVisible, streamingState, history } = useUIState();

  // Track previous state to detect transitions
  const prevDialogsVisible = useRef(dialogsVisible);
  const prevStreamingState = useRef(streamingState);

  // Track if it's the first render to avoid startup beep
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      prevDialogsVisible.current = dialogsVisible;
      prevStreamingState.current = streamingState;
      return;
    }

    const dialogBecameVisible = dialogsVisible && !prevDialogsVisible.current;
    const actionCompleted =
      streamingState === StreamingState.Idle &&
      prevStreamingState.current !== StreamingState.Idle;
    const waitingForConfirmation =
      streamingState === StreamingState.WaitingForConfirmation &&
      prevStreamingState.current !== StreamingState.WaitingForConfirmation;

    const lastHistoryItem = history[history.length - 1];
    const isCancelled =
      lastHistoryItem?.text === 'Request cancelled.' ||
      lastHistoryItem?.text === 'User cancelled the request.';

    if (
      settings.ui?.bell &&
      (dialogBecameVisible ||
        (actionCompleted && !isCancelled) ||
        waitingForConfirmation)
    ) {
      try {
        // Write bell character to stdout
        stdout.write('\x07');
      } catch (e) {
        debugLogger.error('Failed to write bell character', e);
      }
    }

    prevDialogsVisible.current = dialogsVisible;
    prevStreamingState.current = streamingState;
  }, [dialogsVisible, streamingState, settings.ui?.bell, stdout, history]);
};
