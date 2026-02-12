/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  GeminiEventType as ServerGeminiEventType,
  ROOT_SCHEDULER_ID,
} from '@google/gemini-cli-core';
import { AgentFactory } from '@google/gemini-cli-core/dist/src/agents/agent-factory.js';
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
  type LoopDetectionConfirmationRequest,
} from '../types.js';
import { useStateAndRef } from './useStateAndRef.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { mapToDisplay as mapTrackedToolCallsToDisplay } from './toolMapping.js';
import type { TrackedToolCall } from './useToolScheduler.js';
import { type BackgroundShell } from './shellReducer.js';
import type { RetryAttemptPayload } from '@google/gemini-cli-core';

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
  loopDetectionConfirmationRequest: LoopDetectionConfirmationRequest | null;
  lastOutputTime: number;
  backgroundShellCount: number;
  isBackgroundShellVisible: boolean;
  toggleBackgroundShell: () => void;
  backgroundCurrentShell: (() => void) | null;
  backgroundShells: Map<number, BackgroundShell>;
  dismissBackgroundShell: (pid: number) => void;
  retryStatus: RetryAttemptPayload | null;
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
  const streamingContentRef = useRef('');

  const [thought, thoughtRef, setThought] =
    useStateAndRef<ThoughtSummary | null>(null);

  // Track subagent status and output
  const [subagentStatus, setSubagentStatus] = useState<string | null>(null);
  const [subagentOutput, setSubagentOutput] = useState<string | null>(null);

  // Tools for the CURRENT turn of the main agent
  const [toolCalls, setToolCalls] = useState<TrackedToolCall[]>([]);
  const toolCallsRef = useRef<TrackedToolCall[]>([]);

  // Sync ref with state (still useful for some parts)
  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  const pushedToolCallIdsRef = useRef<Set<string>>(new Set());

  const pendingHistoryItems = useMemo(() => {
    const items: HistoryItemWithoutId[] = [];
    if (thought) {
      items.push({
        type: MessageType.THINKING,
        thought,
      } as any as HistoryItemWithoutId);
    }
    if (toolCalls.length > 0) {
      const unpushed = toolCalls.filter(
        (tc) => !pushedToolCallIdsRef.current.has(tc.request.callId),
      );
      if (unpushed.length > 0) {
        items.push(
          mapTrackedToolCallsToDisplay(unpushed as TrackedToolCall[], {
            borderBottom: true,
          }),
        );
      }
    }
            if (streamingContent) {
              items.push({ type: MessageType.GEMINI, text: streamingContent });
            }
        
            if (subagentStatus) {
              items.push({
                type: 'tool_group',
                tools: [
                  {
                    displayName: subagentStatus.split(' is ')[0] || 'Subagent',
                    status: 'validating',
                    description: subagentStatus,
                    resultDisplay: subagentOutput || undefined,
                  },
                ],
                borderBottom: true,
              } as any as HistoryItemWithoutId);
            }
        
            return items;
          }, [thought, toolCalls, streamingContent, subagentStatus, subagentOutput]);
        
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStreamingState(StreamingState.Idle);
    setStreamingContent('');
    streamingContentRef.current = '';
    setThought(null);
    setToolCalls([]);
    toolCallsRef.current = [];
    pushedToolCallIdsRef.current.clear();
    setSubagentStatus(null);
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
          setStreamingContent((prev) => {
            const next = prev + (event.value || '');
            streamingContentRef.current = next;
            return next;
          });
          break;

        case ServerGeminiEventType.Thought:
          setThought(event.value);
          break;

        case ServerGeminiEventType.ToolCallRequest:
          {
            const tool = config.getToolRegistry().getTool(event.value.name);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const invocation = (tool as any)?.createInvocation?.(
              event.value.args,
              config.getMessageBus(),
            );

            const newCall = {
              request: event.value,
              status: 'validating',
              schedulerId: event.value.schedulerId || ROOT_SCHEDULER_ID,
              tool,
              invocation,
            } as TrackedToolCall;

            setToolCalls((prev) => {
              const next = [...prev, newCall];
              toolCallsRef.current = next;
              return next;
            });
          }
          break;

        case ServerGeminiEventType.ToolCallResponse:
          {
            const response = event.value;
            setToolCalls((prev) => {
              const next = prev.map((tc) =>
                tc.request.callId === response.callId
                  ? ({
                      ...tc,
                      status: 'success',
                      result: response,
                    } as unknown as TrackedToolCall)
                  : tc,
              );
              toolCallsRef.current = next;
              return next;
            });
          }
          break;

        case ServerGeminiEventType.TurnFinished:
          // MAIN AGENT turn finished. Flush current state to history.
          setSubagentStatus(null);
          if (thoughtRef.current) {
            addItem({
              type: MessageType.THINKING,
              thought: thoughtRef.current,
            } as any as HistoryItemWithoutId);
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

          if (streamingContentRef.current) {
            addItem({ type: MessageType.GEMINI, text: streamingContentRef.current });
            setStreamingContent('');
            streamingContentRef.current = '';
          }

          setToolCalls([]);
          toolCallsRef.current = [];
          break;

        case ServerGeminiEventType.SubagentActivity:
          {
            const activity = event.value;
            const name =
              activity.agentName.charAt(0).toUpperCase() +
              activity.agentName.slice(1);

            if (activity.type === 'TOOL_CALL_START') {
              setSubagentStatus(`${name} is calling ${activity.data['name']}...`);
              setSubagentOutput((prev) => (prev || '') + `🛠️ Calling ${activity.data['name']}...\n`);
            } else if (activity.type === 'THOUGHT') {
              setSubagentStatus(`${name} is thinking...`);
            } else if (activity.type === 'TOOL_CALL_END') {
              // Just a status update, the tool result will come via TOOL_CALL_RESPONSE eventually
            }
          }
          break;

        case ServerGeminiEventType.Finished:
          setStreamingState(StreamingState.Idle);
          break;

        default:
          break;
      }
    },
    [addItem, config, setThought, thoughtRef],
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
    pendingHistoryItems,
    handleApprovalModeChange: () => {},
    activePtyId: null,
    loopDetectionConfirmationRequest: null,
    lastOutputTime: 0,
    backgroundShellCount: 0,
    isBackgroundShellVisible: false,
    toggleBackgroundShell: () => {},
    backgroundCurrentShell: null,
    backgroundShells: new Map<number, BackgroundShell>(),
    dismissBackgroundShell: () => {},
    retryStatus: null,
  };
};
