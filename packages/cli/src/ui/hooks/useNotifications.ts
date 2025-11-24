/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { NotificationManager } from '../../notifications/manager.js';
import { StreamingState } from '../types.js';
import { debugLogger } from '@google/gemini-cli-core';

/**
 * Hook to manage audio notifications based on application state.
 * @param settings - Application settings including notification preferences
 * @param streamingState - Current streaming state (idle, responding, waiting for confirmation)
 * @param isInputActive - Whether the input prompt is currently active
 * @param isFocused - Whether the terminal window has focus (user is actively viewing the terminal)
 */
export function useNotifications(
  settings: LoadedSettings,
  streamingState: StreamingState,
  isInputActive: boolean,
  isFocused: boolean,
) {
  const managerRef = useRef<NotificationManager | null>(null);
  const lastStreamingStateRef = useRef<StreamingState>(streamingState);
  const lastInputActiveRef = useRef<boolean>(isInputActive);
  const lastFocusedRef = useRef<boolean>(isFocused);

  // Initialize notification manager once
  useEffect(() => {
    managerRef.current = new NotificationManager(settings);
    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update manager when settings change
  // The NotificationManager.updateSettings method handles the update efficiently
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.updateSettings(settings);
    }
  }, [settings]);

  // Handle notifications based on state transitions
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) {
      return;
    }

    const lastStreamingState = lastStreamingStateRef.current;
    const lastInputActive = lastInputActiveRef.current;
    const lastFocused = lastFocusedRef.current;

    const wasStreaming =
      lastStreamingState === StreamingState.Responding ||
      lastStreamingState === StreamingState.WaitingForConfirmation;
    const isNowIdle = streamingState === StreamingState.Idle;
    const isNowWaitingForConfirmation =
      streamingState === StreamingState.WaitingForConfirmation;

    const wasInputActive = lastInputActive;
    const isNowInputActive = isInputActive;
    const wasFocused = lastFocused;
    const isNowFocused = isFocused;

    // Trigger task complete notification when streaming completes
    // Only notify if user is not focused on the terminal window (they're not watching)
    // isFocused checks if the terminal window itself has focus using ANSI focus reporting
    if (wasStreaming && isNowIdle && !isNowFocused) {
      manager.notify('taskComplete').catch((error) => {
        debugLogger.debug(`[Notifications] Error in taskComplete: ${error}`);
      });
    }

    // Trigger input required notification when:
    // 1. Transitioning to WaitingForConfirmation state (tools need confirmation)
    // 2. Transitioning from streaming to idle and input becomes active
    const transitionedToWaitingForConfirmation =
      lastStreamingState !== StreamingState.WaitingForConfirmation &&
      isNowWaitingForConfirmation;
    const transitioningToIdleAndInputActive =
      wasStreaming && isNowIdle && !wasInputActive && isNowInputActive;

    if (
      (transitionedToWaitingForConfirmation ||
        transitioningToIdleAndInputActive) &&
      !isNowFocused
    ) {
      manager
        .notify('inputRequired')
        .then(() => {
          // Start idle timer after notification is sent
          // Timer will trigger idleAlert if user doesn't focus within timeout
          manager.startIdleTimer();
        })
        .catch((error) => {
          debugLogger.debug(`[Notifications] Error in inputRequired: ${error}`);
        });
    }

    // Cancel idle timer when user focuses on terminal or provides input
    // User has responded, so no need for idle alert
    if (
      (!wasFocused && isNowFocused) ||
      (!wasInputActive && isNowInputActive)
    ) {
      manager.cancelIdleTimer();
    }

    // Update refs after processing
    lastStreamingStateRef.current = streamingState;
    lastInputActiveRef.current = isInputActive;
    lastFocusedRef.current = isFocused;
  }, [streamingState, isInputActive, isFocused]);
}
