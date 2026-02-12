/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  GeminiEventType as ServerGeminiEventType,
  debugLogger,
  AgentFactory,
} from '@google/gemini-cli-core';
import type {
  Config,
  ServerGeminiStreamEvent as GeminiEvent,
  ThoughtSummary,
} from '@google/gemini-cli-core';
import { type PartListUnion, type Part } from '@google/genai';
import {
  StreamingState,
  MessageType,
  type HistoryItemWithoutId,
} from '../types.js';
import { useStateAndRef } from './useStateAndRef.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { mapToDisplay as mapTrackedToolCallsToDisplay } from './toolMapping.js';
import { ROOT_SCHEDULER_ID } from '@google/gemini-cli-core';
import type { TrackedToolCall } from './useToolScheduler.js';

export interface UseAgentHarnessReturn {
  streamingState: StreamingState;
  isResponding: boolean;
  thought: ThoughtSummary | null;
  streamingContent: string;
  toolCalls: TrackedToolCall[];
  submitQuery: (query: PartListUnion) => Promise<void>;
  cancelOngoingRequest: () => void;
  reset: () => void;
  // Legacy compatibility properties
  initError: Error | null;
  pendingHistoryItems: HistoryItemWithoutId[];
  handleApprovalModeChange: (mode: string) => void;
  activePtyId: number | null;
  loopDetectionConfirmationRequest: unknown | null;
  lastOutputTime: number;
  backgroundShellCount: number;
  isBackgroundShellVisible: boolean;
  toggleBackgroundShell: () => void;
  backgroundCurrentShell: unknown | null;
  backgroundShells: Map<number, unknown>;
  dismissBackgroundShell: (pid: number) => void;
  retryStatus: unknown | null;
}

/**
 * A specialized hook for processing streams from the AgentHarness.
 * COMPLETELY FORKED from useGeminiStream to ensure zero regressions in legacy mode.
 */
export const useAgentHarness = (
  addItem: UseHistoryManagerReturn['addItem'],
  config: Config,
  onCancelSubmit: (fullReset: boolean) => void,
): UseAgentHarnessReturn => {
  const [streamingState, setStreamingState] = useState<StreamingState>(
    StreamingState.Idle,
  );
  const [streamingContent, setStreamingContent] = useState('');
  const [thought, thoughtRef, setThought] = useStateAndRef<ThoughtSummary | null>(null);

  // Tools for the CURRENT turn of the main agent
  const [toolCalls, setToolCalls] = useState<TrackedToolCall[]>([]);
  const toolCallsRef = useRef<TrackedToolCall[]>([]);
  
  // Sync ref with state
  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  const pushedToolCallIdsRef = useRef<Set<string>>(new Set());

  // Track subagent activities for hierarchical display
  // For now, we just log them. In future, we can add a specialized "SubagentBlock" history item.
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStreamingState(StreamingState.Idle);
    setStreamingContent('');
    setThought(null);
    setToolCalls([]);
    pushedToolCallIdsRef.current.clear();
  }, [setThought]);

  const cancelOngoingRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onCancelSubmit(true);
    reset();
  }, [onCancelSubmit, reset]);

  const processEvent = useCallback(
    (event: GeminiEvent) => {
      switch (event.type) {
        case ServerGeminiEventType.Content:
          setStreamingState(StreamingState.Responding);
          setStreamingContent((prev) => prev + (event.value || ''));
          break;

        case ServerGeminiEventType.Thought:
          setThought(event.value);
          break;

        case ServerGeminiEventType.ToolCallRequest:
          setToolCalls((prev) => [
            ...prev,
            {
              request: event.value,
              status: 'validating',
              schedulerId: event.value.schedulerId || ROOT_SCHEDULER_ID,
            } as TrackedToolCall,
          ]);
          break;

        case ServerGeminiEventType.ToolCallResponse:
          {
            const response = event.value;
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.request.callId === response.callId
                  ? ({
                      ...tc,
                      status: 'success',
                      result: response,
                    } as TrackedToolCall)
                  : tc,
              ),
            );
          }
          break;

        case ServerGeminiEventType.TurnFinished:
          // MAIN AGENT turn finished. Flush current state to history.
          if (thoughtRef.current) {
            addItem({
              type: MessageType.THINKING,
              thought: thoughtRef.current,
            } as HistoryItemWithoutId);
            setThought(null);
          }

          if (toolCallsRef.current.length > 0) {
            const unpushed = toolCallsRef.current.filter(
              (tc) => !pushedToolCallIdsRef.current.has(tc.request.callId),
            );
            if (unpushed.length > 0) {
              addItem(
                mapTrackedToolCallsToDisplay(unpushed as TrackedToolCall[], {
                  borderBottom: true,
                }),
              );
              unpushed.forEach((tc) =>
                pushedToolCallIdsRef.current.add(tc.request.callId),
              );
            }
          }

          if (streamingContent) {
            addItem({ type: 'gemini', text: streamingContent });
            setStreamingContent('');
          }

          setToolCalls([]);
          break;

        case ServerGeminiEventType.SubagentActivity:
          debugLogger.debug(`[HarnessHook] Subagent activity: ${event.value.type} for ${event.value.agentName}`);
          break;

        case ServerGeminiEventType.Finished:
          setStreamingState(StreamingState.Idle);
          break;

        default:
          break;
      }
    },
    [addItem, setThought, thoughtRef, streamingContent],
  );

  const submitQuery = useCallback(
    async (parts: PartListUnion) => {
      reset();
      setStreamingState(StreamingState.Responding);

      abortControllerRef.current = new AbortController();
      const harness = AgentFactory.createHarness(config);

      // Convert parts to Part[] array for harness
      const requestParts: Part[] = Array.isArray(parts)
        ? (parts as Part[])
        : [{ text: String(parts) }];

      const stream = harness.run(
        requestParts,
        abortControllerRef.current.signal,
      );

      try {
        for await (const event of stream) {
          processEvent(event);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : String(err);
        addItem({ type: MessageType.ERROR, text: msg });
      } finally {
        setStreamingState(StreamingState.Idle);
      }
    },
    [config, reset, processEvent, addItem],
  );

  return {
    streamingState,
    isResponding: streamingState !== StreamingState.Idle,
    thought,
    streamingContent,
    toolCalls,
    submitQuery,
    cancelOngoingRequest,
    reset,
    initError: null,
    pendingHistoryItems: [],
    handleApprovalModeChange: () => {},
    activePtyId: null,
    loopDetectionConfirmationRequest: null,
    lastOutputTime: 0,
    backgroundShellCount: 0,
    isBackgroundShellVisible: false,
    toggleBackgroundShell: () => {},
    backgroundCurrentShell: null,
    backgroundShells: new Map(),
    dismissBackgroundShell: () => {},
    retryStatus: null,
  };
};
