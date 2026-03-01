/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type ToolCallRequestInfo,
  type ToolCall,
  type CompletedToolCall,
  MessageBusType,
  ROOT_SCHEDULER_ID,
  Scheduler,
  type EditorType,
  type ToolCallsUpdateMessage,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { useCallback, useState, useMemo, useEffect, useRef } from 'react';

// Re-exporting types compatible with hook expectations
export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
) => Promise<CompletedToolCall[]>;

export type MarkToolsAsSubmittedFn = (callIds: string[]) => void;
export type CancelAllFn = (signal: AbortSignal) => void;

/**
 * The shape expected by useGeminiStream.
 * It matches the Core ToolCall structure + the UI metadata flag.
 */
export type TrackedToolCall = ToolCall & {
  responseSubmittedToGemini?: boolean;
};

// Narrowed types for specific statuses (used by useGeminiStream)
export type TrackedScheduledToolCall = Extract<
  TrackedToolCall,
  { status: 'scheduled' }
>;
export type TrackedValidatingToolCall = Extract<
  TrackedToolCall,
  { status: 'validating' }
>;
export type TrackedWaitingToolCall = Extract<
  TrackedToolCall,
  { status: 'awaiting_approval' }
>;
export type TrackedExecutingToolCall = Extract<
  TrackedToolCall,
  { status: 'executing' }
>;
export type TrackedCompletedToolCall = Extract<
  TrackedToolCall,
  { status: 'success' | 'error' }
>;
export type TrackedCancelledToolCall = Extract<
  TrackedToolCall,
  { status: 'cancelled' }
>;

/**
 * Modern tool scheduler hook using the event-driven Core Scheduler.
 */
export function useToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => Promise<void>,
  config: Config,
  getPreferredEditor: () => EditorType | undefined,
): [
  TrackedToolCall[],
  ScheduleFn,
  MarkToolsAsSubmittedFn,
  React.Dispatch<React.SetStateAction<TrackedToolCall[]>>,
  CancelAllFn,
  number,
] {
  // State stores tool calls organized by their originating schedulerId
  const [toolCallsMap, setToolCallsMap] = useState<
    Record<string, TrackedToolCall[]>
  >({});
  const [lastToolOutputTime, setLastToolOutputTime] = useState<number>(0);

  const messageBus = useMemo(() => config.getMessageBus(), [config]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const getPreferredEditorRef = useRef(getPreferredEditor);
  useEffect(() => {
    getPreferredEditorRef.current = getPreferredEditor;
  }, [getPreferredEditor]);

  const scheduler = useMemo(
    () =>
      new Scheduler({
        config,
        messageBus,
        getPreferredEditor: () => getPreferredEditorRef.current(),
        schedulerId: ROOT_SCHEDULER_ID,
      }),
    [config, messageBus],
  );

  useEffect(() => () => scheduler.dispose(), [scheduler]);

  const internalAdaptToolCalls = useCallback(
    (coreCalls: ToolCall[], prevTracked: TrackedToolCall[]) =>
      adaptToolCalls(coreCalls, prevTracked),
    [],
  );

  useEffect(() => {
    const handler = (event: ToolCallsUpdateMessage) => {
      const isRoot = event.schedulerId === ROOT_SCHEDULER_ID;

      setToolCallsMap((prev) => {
        const prevCalls = prev[event.schedulerId] ?? [];
        const prevCallIds = new Set(prevCalls.map((tc) => tc.request.callId));

        // For non-root schedulers, we only show tool calls that:
        // 1. Are currently awaiting approval.
        // 2. Were previously shown (e.g., they are now executing or completed).
        // This prevents "thinking" tools (reads/searches) from flickering in the UI
        // unless they specifically required user interaction.
        const filteredToolCalls = isRoot
          ? event.toolCalls
          : event.toolCalls.filter(
              (tc) =>
                tc.status === CoreToolCallStatus.AwaitingApproval ||
                prevCallIds.has(tc.request.callId),
            );

        // If this is a subagent and we have no tools to show and weren't showing any,
        // we can skip the update entirely to avoid unnecessary re-renders.
        if (
          !isRoot &&
          filteredToolCalls.length === 0 &&
          prevCalls.length === 0
        ) {
          return prev;
        }

        const adapted = internalAdaptToolCalls(filteredToolCalls, prevCalls);

        return {
          ...prev,
          [event.schedulerId]: adapted,
        };
      });

      // Update output timer for UI spinners (Side Effect)
      const hasExecuting = event.toolCalls.some(
        (tc) =>
          tc.status === CoreToolCallStatus.Executing ||
          ((tc.status === CoreToolCallStatus.Success ||
            tc.status === CoreToolCallStatus.Error) &&
            'tailToolCallRequest' in tc &&
            tc.tailToolCallRequest != null),
      );

      if (hasExecuting) {
        setLastToolOutputTime(Date.now());
      }
    };

    messageBus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, handler);
    return () => {
      messageBus.unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, handler);
    };
  }, [messageBus, internalAdaptToolCalls]);

  const schedule: ScheduleFn = useCallback(
    async (request, signal) => {
      // Clear state for new run
      setToolCallsMap({});

      // 1. Await Core Scheduler directly
      const results = await scheduler.schedule(request, signal);

      // 2. Trigger legacy reinjection logic (useGeminiStream loop)
      // Since this hook instance owns the "root" scheduler, we always trigger
      // onComplete when it finishes its batch.
      await onCompleteRef.current(results);

      return results;
    },
    [scheduler],
  );

  const cancelAll: CancelAllFn = useCallback(
    (_signal) => {
      scheduler.cancelAll();
    },
    [scheduler],
  );

  const markToolsAsSubmitted: MarkToolsAsSubmittedFn = useCallback(
    (callIdsToMark: string[]) => {
      setToolCallsMap((prevMap) => {
        const nextMap = { ...prevMap };
        for (const [sid, calls] of Object.entries(nextMap)) {
          nextMap[sid] = calls.map((tc) =>
            callIdsToMark.includes(tc.request.callId)
              ? { ...tc, responseSubmittedToGemini: true }
              : tc,
          );
        }
        return nextMap;
      });
    },
    [],
  );

  // Flatten the map for the UI components that expect a single list of tools.
  const toolCalls = useMemo(
    () => Object.values(toolCallsMap).flat(),
    [toolCallsMap],
  );

  // Provide a setter that maintains compatibility with legacy [].
  const setToolCallsForDisplay = useCallback(
    (action: React.SetStateAction<TrackedToolCall[]>) => {
      setToolCallsMap((prev) => {
        const currentFlattened = Object.values(prev).flat();
        const nextFlattened =
          typeof action === 'function' ? action(currentFlattened) : action;

        if (nextFlattened.length === 0) {
          return {};
        }

        // Re-group by schedulerId to preserve multi-scheduler state
        const nextMap: Record<string, TrackedToolCall[]> = {};
        for (const call of nextFlattened) {
          // All tool calls should have a schedulerId from the core.
          // Default to ROOT_SCHEDULER_ID as a safeguard.
          const sid = call.schedulerId ?? ROOT_SCHEDULER_ID;
          if (!nextMap[sid]) {
            nextMap[sid] = [];
          }
          nextMap[sid].push(call);
        }
        return nextMap;
      });
    },
    [],
  );

  return [
    toolCalls,
    schedule,
    markToolsAsSubmitted,
    setToolCallsForDisplay,
    cancelAll,
    lastToolOutputTime,
  ];
}

/**
 * ADAPTER: Merges UI metadata (submitted flag).
 */
function adaptToolCalls(
  coreCalls: ToolCall[],
  prevTracked: TrackedToolCall[],
): TrackedToolCall[] {
  const prevMap = new Map(prevTracked.map((t) => [t.request.callId, t]));

  return coreCalls.map((coreCall): TrackedToolCall => {
    const prev = prevMap.get(coreCall.request.callId);
    const responseSubmittedToGemini = prev?.responseSubmittedToGemini ?? false;

    let status = coreCall.status;
    // If a tool call has completed but scheduled a tail call, it is in a transitional
    // state. Force the UI to render it as "executing".
    if (
      (status === CoreToolCallStatus.Success ||
        status === CoreToolCallStatus.Error) &&
      'tailToolCallRequest' in coreCall &&
      coreCall.tailToolCallRequest != null
    ) {
      status = CoreToolCallStatus.Executing;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      ...coreCall,
      status,
      responseSubmittedToGemini,
    } as TrackedToolCall;
  });
}
