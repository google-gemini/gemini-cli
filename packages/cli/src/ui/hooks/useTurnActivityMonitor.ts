/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { StreamingState } from '../types.js';
import { hasRedirection } from '@google/gemini-cli-core';
import { type TrackedToolCall } from './useReactToolScheduler.js';

export interface TurnActivityStatus {
  operationStartTime: number;
  isRedirectionActive: boolean;
}

/**
 * Monitors the activity of a Gemini turn to detect when a new operation starts
 * and whether it involves shell redirections that should suppress inactivity prompts.
 */
export const useTurnActivityMonitor = (
  streamingState: StreamingState,
  activePtyId: number | string | null | undefined,
  pendingToolCalls: TrackedToolCall[] = [],
): TurnActivityStatus => {
  const [operationStartTime, setOperationStartTime] = useState(0);

  // Reset operation start time whenever a new operation begins.
  // We consider an operation to have started when we enter Responding state,
  // OR when the active PTY changes (meaning a new command started within the turn).
  const prevPtyIdRef = useRef<number | string | null | undefined>(undefined);
  const prevStreamingStateRef = useRef<StreamingState | undefined>(undefined);

  useEffect(() => {
    const isNowResponding = streamingState === StreamingState.Responding;
    const wasResponding =
      prevStreamingStateRef.current === StreamingState.Responding;
    const ptyChanged = activePtyId !== prevPtyIdRef.current;

    if (isNowResponding && (!wasResponding || ptyChanged)) {
      setOperationStartTime(Date.now());
    } else if (!isNowResponding && wasResponding) {
      setOperationStartTime(0);
    }

    prevPtyIdRef.current = activePtyId;
    prevStreamingStateRef.current = streamingState;
  }, [streamingState, activePtyId]);

  // Detect redirection in the current query or tool calls.
  // We derive this directly during render to ensure it's accurate from the first frame.
  const isRedirectionActive = useMemo(
    () =>
      // Check active tool calls for run_shell_command
      pendingToolCalls.some((tc) => {
        if (tc.request.name !== 'run_shell_command') return false;

        const command =
          (tc.request.args as { command?: string })?.command || '';
        return hasRedirection(command);
      }),
    [pendingToolCalls],
  );

  return {
    operationStartTime,
    isRedirectionActive,
  };
};
