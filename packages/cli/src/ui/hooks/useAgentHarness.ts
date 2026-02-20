/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  GeminiEventType as ServerGeminiEventType,
  ROOT_SCHEDULER_ID,
  AgentFactory,
  MessageBusType,
} from '@google/gemini-cli-core';
import type {
  Config,
  ServerGeminiStreamEvent as GeminiEvent,
  ThoughtSummary,
  RetryAttemptPayload,
  ToolCallsUpdateMessage,
  ValidatingToolCall,
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

export interface UseAgentHarnessReturn {
  streamingState: StreamingState;
  isResponding: boolean;
  thought: ThoughtSummary | null;
  streamingContent: string;
  toolCalls: TrackedToolCall[];
  submitQuery: (query: PartListUnion) => Promise<void>;
  processEvent: (event: GeminiEvent) => void;
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

  // Tools for the CURRENT turn of the main agent
  const [toolCalls, setToolCalls] = useState<TrackedToolCall[]>([]);
  const toolCallsRef = useRef<TrackedToolCall[]>([]);

  // Sync ref with state (still useful for some parts)
  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  const pushedToolCallIdsRef = useRef<Set<string>>(new Set());

  // Listen to the MessageBus for live tool updates (e.g. from subagents or long-running tools)
  useEffect(() => {
    const bus = config.getMessageBus();
    const handler = (event: ToolCallsUpdateMessage) => {
      setToolCalls((prev) => {
        const next = [...prev];
        for (const coreCall of event.toolCalls) {
          const index = next.findIndex(
            (tc) => tc.request.callId === coreCall.request.callId,
          );
          if (index !== -1) {
            next[index] = {
              ...next[index],
              ...coreCall,
            };
          }
        }
        toolCallsRef.current = next;
        return next;
      });
    };
    bus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, handler);
    return () => {
      bus.unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, handler);
    };
  }, [config]);

  const pendingHistoryItems = useMemo(() => {
    const items: HistoryItemWithoutId[] = [];

    // Only show the top-level thought if we aren't currently executing tools (delegations)
    // Subagent internal thoughts are merged into the tool box via SubagentActivity handler.
    if (thought && toolCalls.length === 0) {
      items.push({
        type: MessageType.THINKING,
        thought,
      } as HistoryItemWithoutId);
    }
    if (toolCalls.length > 0) {
      const unpushed = toolCalls.filter(
        (tc) => !pushedToolCallIdsRef.current.has(tc.request.callId),
      );
      if (unpushed.length > 0) {
        items.push(
          mapToDisplayInternal(unpushed, {
            borderBottom: true,
          }),
        );
      }
    }
    if (streamingContent) {
      items.push({ type: MessageType.GEMINI, text: streamingContent });
    }
    return items;
  }, [thought, toolCalls, streamingContent]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStreamingState(StreamingState.Idle);
    setStreamingContent('');
    streamingContentRef.current = '';
    setThought(null);
    setToolCalls([]);
    toolCallsRef.current = [];
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
          {
            const nextContent =
              streamingContentRef.current + (event.value || '');
            streamingContentRef.current = nextContent;
            setStreamingContent(nextContent);
          }
          break;

        case ServerGeminiEventType.Thought:
          setThought(event.value);
          break;

        case ServerGeminiEventType.ToolCallRequest:
          {
            setThought(null);
            const tool = config.getToolRegistry().getTool(event.value.name);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
            const invocation = (tool as any)?.createInvocation?.(
              event.value.args,
              config.getMessageBus(),
            );

            // In Harness mode, top-level calls might not have schedulerId set yet.
            // We default to ROOT_SCHEDULER_ID to ensure they are visible.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const newCall: TrackedToolCall = {
              request: {
                ...event.value,
                schedulerId: event.value.schedulerId || ROOT_SCHEDULER_ID,
              },
              status: 'validating',
              schedulerId: event.value.schedulerId || ROOT_SCHEDULER_ID,
              tool: tool || undefined,
              invocation: invocation || undefined,
            } as ValidatingToolCall;

            const nextCalls = [...toolCallsRef.current, newCall];
            toolCallsRef.current = nextCalls;
            setToolCalls(nextCalls);
          }
          break;

        case ServerGeminiEventType.ToolCallResponse:
          {
            const response = event.value;
            const nextCalls = toolCallsRef.current.map((tc) =>
              tc.request.callId === response.callId
                ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                  ({
                    ...tc,
                    status: 'success',
                    response,
                  } as unknown as TrackedToolCall)
                : tc,
            );
            toolCallsRef.current = nextCalls;
            setToolCalls(nextCalls);
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
                mapToDisplayInternal(unpushed, {
                  borderBottom: true,
                }),
              );
              unpushed.forEach((tc) =>
                pushedToolCallIdsRef.current.add(tc.request.callId),
              );
            }
          }

          if (streamingContentRef.current) {
            addItem({
              type: MessageType.GEMINI,
              text: streamingContentRef.current,
            });
            setStreamingContent('');
            streamingContentRef.current = '';
          }

          toolCallsRef.current = [];
          setToolCalls([]);
          break;

        case ServerGeminiEventType.SubagentActivity:
          {
            const activity = event.value;
            let matched = false;

            const nextCalls = toolCallsRef.current.map((tc) => {
              // Try to find the tool box that belongs to this agent.
              // Note: We search ALL tool calls, not just 'executing', in case of race conditions.
              if (
                tc.request.name === activity.agentName ||
                (tc.tool?.displayName || tc.request.name) === activity.agentName
              ) {
                matched = true;
                let output = '';
                if (
                  tc.status === 'success' ||
                  tc.status === 'error' ||
                  tc.status === 'cancelled'
                ) {
                  output = String(tc.response.resultDisplay || '');
                }
                if (typeof output !== 'string') output = '';

                if (activity.type === 'TOOL_CALL_START') {
                  const rawName = String(activity.data['name'] || 'a tool');
                  const tool = config.getToolRegistry().getTool(rawName);
                  const displayName = tool?.displayName || rawName;
                  output += `🛠️ Calling ${displayName}...\n`;
                } else if (activity.type === 'THOUGHT') {
                  const subject = String(
                    activity.data['subject'] || 'Thinking',
                  );
                  output += `🤖💭 ${subject}\n`;
                }

                const currentResponse =
                  tc.status === 'success' ||
                  tc.status === 'error' ||
                  tc.status === 'cancelled'
                    ? tc.response
                    : {};

                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                return {
                  ...tc,
                  response: {
                    ...currentResponse,
                    resultDisplay: output,
                  },
                } as unknown as TrackedToolCall;
              }
              return tc;
            });

            if (matched) {
              toolCallsRef.current = nextCalls;
              setToolCalls(nextCalls);
            } else {
              // Fallback: If no tool box matches, show it as a standalone item
              if (activity.type === 'THOUGHT') {
                addItem({
                  type: MessageType.GEMINI,
                  text: `🤖💭 [${activity.agentName}] ${activity.data['subject']}`,
                });
              }
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

  // Listen for nested subagent activity on the MessageBus
  useEffect(() => {
    const bus = config.getMessageBus();
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion */
    const handler = (event: any) => {
      processEvent({
        type: ServerGeminiEventType.SubagentActivity,
        value: event.activity,
      } as any as GeminiEvent);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion */
    bus.subscribe(MessageBusType.SUBAGENT_ACTIVITY, handler);
    return () => {
      bus.unsubscribe(MessageBusType.SUBAGENT_ACTIVITY, handler);
    };
  }, [config, processEvent]);

  const submitQuery = useCallback(
    async (parts: PartListUnion) => {
      reset();
      setStreamingState(StreamingState.Responding);

      abortControllerRef.current = new AbortController();
      const harness = AgentFactory.createHarness(config);

      // Convert parts to Part[] array for harness
      /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
      const requestParts: Part[] = Array.isArray(parts)
        ? (parts as Part[])
        : [{ text: String(parts) }];
      /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

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
    processEvent,
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

/**
 * Internal mapper to ensure we don't accidentally leak subagent-internal tools
 * into the main UI boxes while in Harness Mode.
 */
function mapToDisplayInternal(
  calls: TrackedToolCall[],
  options: { borderTop?: boolean; borderBottom?: boolean },
): HistoryItemWithoutId {
  // We filter out any tool calls that are NOT part of the root harness level.
  // This prevents internal subagent work (like list_directory) from appearing
  // as loose tool boxes in the main chat.
  const filtered = calls.filter(
    (c) =>
      // Only show tools belonging to the main top-level session.
      c.schedulerId === ROOT_SCHEDULER_ID,
  );

  return mapTrackedToolCallsToDisplay(filtered, options);
}
