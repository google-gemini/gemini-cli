/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo, useReducer } from 'react';
import { StreamingState } from '../types.js';
import {
  getShellConfiguration,
  hasRedirection,
  hasRedirectionAsync,
  isDefaultHasRedirection,
  type CoreToolCallStatus,
  type SerializableConfirmationDetails,
  type ToolCallConfirmationDetails,
  type ToolCallRequestInfo,
} from '@google/gemini-cli-core';

export interface MinimalTrackedToolCall {
  status: CoreToolCallStatus;
  request: ToolCallRequestInfo;
  confirmationDetails?:
    | ToolCallConfirmationDetails
    | SerializableConfirmationDetails;
}

export interface TurnActivityStatus {
  operationStartTime: number;
  isRedirectionActive: boolean;
}

type RedirectionCacheAction =
  | { type: 'set'; command: string; hasRedirection: boolean }
  | { type: 'reset' };

const EMPTY_REDIRECTION_MAP: ReadonlyMap<string, boolean> = new Map();

function redirectionCacheReducer(
  state: ReadonlyMap<string, boolean>,
  action: RedirectionCacheAction,
): ReadonlyMap<string, boolean> {
  switch (action.type) {
    case 'set': {
      if (state.get(action.command) === action.hasRedirection) {
        return state;
      }
      const next = new Map(state);
      next.set(action.command, action.hasRedirection);
      return next;
    }
    case 'reset':
      return state.size === 0 ? state : EMPTY_REDIRECTION_MAP;
    default:
      return state;
  }
}

function shouldUseAsyncPowerShellRedirection(): boolean {
  return (
    typeof isDefaultHasRedirection === 'function' &&
    isDefaultHasRedirection(hasRedirection) &&
    typeof hasRedirectionAsync === 'function' &&
    typeof getShellConfiguration === 'function' &&
    getShellConfiguration().shell === 'powershell'
  );
}

function extractShellCommand(tc: MinimalTrackedToolCall): string {
  const rawCommand = tc.request.args?.['command'];
  return typeof rawCommand === 'string' ? rawCommand : '';
}

/**
 * Monitors the activity of a Gemini turn to detect when a new operation starts
 * and whether it involves shell redirections that should suppress inactivity prompts.
 */
export const useTurnActivityMonitor = (
  streamingState: StreamingState,
  activePtyId: number | string | null | undefined,
  pendingToolCalls: MinimalTrackedToolCall[] = [],
): TurnActivityStatus => {
  const [operationStartTime, setOperationStartTime] = useState(0);
  const [resolvedRedirections, dispatchRedirection] = useReducer(
    redirectionCacheReducer,
    EMPTY_REDIRECTION_MAP,
  );
  const inFlightCommandsRef = useRef<Set<string>>(new Set());
  const turnEpochRef = useRef(0);
  const turnAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      turnAbortControllerRef.current?.abort();
      turnAbortControllerRef.current = null;
    };
  }, []);

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

  useEffect(() => {
    if (
      streamingState === StreamingState.Idle &&
      pendingToolCalls.length === 0
    ) {
      turnEpochRef.current += 1;
      turnAbortControllerRef.current?.abort();
      turnAbortControllerRef.current = null;
      inFlightCommandsRef.current.clear();
      dispatchRedirection({ type: 'reset' });
      return;
    }

    if (!shouldUseAsyncPowerShellRedirection()) {
      return;
    }

    if (
      !turnAbortControllerRef.current ||
      turnAbortControllerRef.current.signal.aborted
    ) {
      turnAbortControllerRef.current = new AbortController();
    }
    const turnSignal = turnAbortControllerRef.current.signal;
    const epoch = turnEpochRef.current;

    for (const tc of pendingToolCalls) {
      if (tc.request.name !== 'run_shell_command') {
        continue;
      }
      if (
        tc.confirmationDetails?.type === 'exec' &&
        typeof tc.confirmationDetails.hasRedirection === 'boolean'
      ) {
        continue;
      }
      const command = extractShellCommand(tc);
      if (
        !command ||
        !/[><]/.test(command) ||
        resolvedRedirections.has(command) ||
        inFlightCommandsRef.current.has(command)
      ) {
        continue;
      }

      inFlightCommandsRef.current.add(command);
      void hasRedirectionAsync(command, undefined, turnSignal)
        .then((redirected) => {
          inFlightCommandsRef.current.delete(command);
          if (
            isMountedRef.current &&
            turnEpochRef.current === epoch &&
            !turnSignal.aborted
          ) {
            dispatchRedirection({
              type: 'set',
              command,
              hasRedirection: redirected,
            });
          }
        })
        .catch(() => {
          inFlightCommandsRef.current.delete(command);
        });
    }
  }, [streamingState, pendingToolCalls, resolvedRedirections]);

  // Detect redirection in the current query or tool calls without blocking the
  // UI thread on synchronous PowerShell AST parsing on Windows.
  const isRedirectionActive = useMemo(() => {
    const useAsyncPowerShell = shouldUseAsyncPowerShellRedirection();
    return pendingToolCalls.some((tc) => {
      if (tc.request.name !== 'run_shell_command') return false;

      if (
        tc.confirmationDetails?.type === 'exec' &&
        typeof tc.confirmationDetails.hasRedirection === 'boolean'
      ) {
        return tc.confirmationDetails.hasRedirection;
      }

      const command = extractShellCommand(tc);
      if (!command) {
        return false;
      }

      if (!useAsyncPowerShell) {
        return hasRedirection(command);
      }

      if (!/[><]/.test(command)) {
        return false;
      }

      return resolvedRedirections.get(command) ?? false;
    });
  }, [pendingToolCalls, resolvedRedirections]);

  return {
    operationStartTime,
    isRedirectionActive,
  };
};
