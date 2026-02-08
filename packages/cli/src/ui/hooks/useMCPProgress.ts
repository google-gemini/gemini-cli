/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  coreEvents,
  CoreEvent,
  type MCPToolProgressPayload,
} from '@google/gemini-cli-core';
import type { Progress } from '@modelcontextprotocol/sdk/types.js';

export interface MCPProgressState {
  [callId: string]: Progress;
}

/**
 * Hook to track MCP tool progress updates.
 * Subscribes to CoreEvent.MCPToolProgress and maintains state per callId.
 */
export const useMCPProgress = () => {
  const [progressState, setProgressState] = useState<MCPProgressState>({});
  // Track completed callIds to reject late-arriving progress events.
  // Without this, a progress event arriving after clearProgress() would
  // reintroduce a stale entry into progressState.
  const completedCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleProgress = (payload: MCPToolProgressPayload) => {
      // Reject progress for calls that have already reached a terminal state
      if (completedCallIds.current.has(payload.callId)) {
        return;
      }
      setProgressState((prev) => ({
        ...prev,
        [payload.callId]: {
          progress: payload.progress,
          total: payload.total,
          message: payload.message,
        },
      }));
    };

    coreEvents.on(CoreEvent.MCPToolProgress, handleProgress);
    return () => {
      coreEvents.off(CoreEvent.MCPToolProgress, handleProgress);
    };
  }, []);

  const clearProgress = useCallback((callId: string) => {
    completedCallIds.current.add(callId);
    setProgressState((prev) => {
      if (!(callId in prev)) return prev; // No state to clear — avoid re-render
      const { [callId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllProgress = useCallback(() => {
    // Reset completed tracking when starting fresh (new schedule)
    completedCallIds.current.clear();
    setProgressState({});
  }, []);

  return { progressState, clearProgress, clearAllProgress };
};
