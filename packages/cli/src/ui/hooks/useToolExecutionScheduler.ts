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
  type ToolCallConfirmationDetails,
  type ToolConfirmationPayload,
  MessageBusType,
  ToolConfirmationOutcome,
  Scheduler,
  type EditorType,
  type ToolCallsUpdateMessage,
} from '@google/gemini-cli-core';
import { useCallback, useState, useMemo, useEffect, useRef } from 'react';

// Re-exporting types compatible with legacy hook expectations
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

/**
 * Modern tool scheduler hook using the event-driven Core Scheduler.
 *
 * This hook acts as an Adapter between the new MessageBus-driven Core
 * and the legacy callback-based UI components.
 */
export function useToolExecutionScheduler(
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
  // State stores Core objects, not Display objects
  const [toolCalls, setToolCalls] = useState<TrackedToolCall[]>([]);
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
      }),
    [config, messageBus],
  );

  /**
   * ADAPTER: Merges UI metadata (submitted flag) and injects legacy callbacks.
   */
  const adaptToolCalls = useCallback(
    (
      coreCalls: ToolCall[],
      prevTracked: TrackedToolCall[],
    ): TrackedToolCall[] => {
      const prevMap = new Map(prevTracked.map((t) => [t.request.callId, t]));

      return coreCalls.map((coreCall): TrackedToolCall => {
        const prev = prevMap.get(coreCall.request.callId);

        // 1. Preserve metadata
        const responseSubmittedToGemini =
          prev?.responseSubmittedToGemini ?? false;

        // 2. Inject onConfirm adapter if needed
        // The Core provides data-only confirmationDetails. We must inject the
        // legacy function that proxies to the Event Bus.
        let confirmationDetails =
          coreCall.status === 'awaiting_approval'
            ? coreCall.confirmationDetails
            : undefined;

        if (
          coreCall.status === 'awaiting_approval' &&
          coreCall.correlationId &&
          confirmationDetails
        ) {
          const correlationId = coreCall.correlationId;
          confirmationDetails = {
            ...confirmationDetails,
            onConfirm: async (
              outcome: ToolConfirmationOutcome,
              payload?: ToolConfirmationPayload,
            ) => {
              await messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId,
                confirmed: outcome !== ToolConfirmationOutcome.Cancel,
                requiresUserConfirmation: false, // Explicitly false as UI handled it
                outcome,
                payload, // Pass payload (e.g. inline edits) to the bus
              });
            },
          } as ToolCallConfirmationDetails;
        }

        // Return the enriched object
        if (
          coreCall.status === 'awaiting_approval' &&
          confirmationDetails !== coreCall.confirmationDetails
        ) {
          return {
            ...coreCall,
            confirmationDetails:
              confirmationDetails as ToolCallConfirmationDetails,
            responseSubmittedToGemini,
          };
        }

        return {
          ...coreCall,
          responseSubmittedToGemini,
        };
      });
    },
    [messageBus],
  );

  useEffect(() => {
    const handler = (message: unknown) => {
      const event = message as ToolCallsUpdateMessage;
      if (event.type !== MessageBusType.TOOL_CALLS_UPDATE) {
        return;
      }

      setToolCalls((prev) => {
        const adapted = adaptToolCalls(event.toolCalls, prev);

        // Update output timer for UI spinners
        if (event.toolCalls.some((tc) => tc.status === 'executing')) {
          setLastToolOutputTime(Date.now());
        }

        return adapted;
      });
    };

    messageBus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, handler);
    return () => {
      messageBus.unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, handler);
    };
  }, [messageBus, adaptToolCalls]);

  const schedule: ScheduleFn = useCallback(
    async (request, signal) => {
      // Clear state for new run
      setToolCalls([]);

      // 1. Await Core Scheduler directly
      const results = await scheduler.schedule(request, signal);

      // 2. Trigger legacy reinjection logic (useGeminiStream loop)
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
      setToolCalls((prevCalls) =>
        prevCalls.map((tc) =>
          callIdsToMark.includes(tc.request.callId)
            ? { ...tc, responseSubmittedToGemini: true }
            : tc,
        ),
      );
    },
    [],
  );

  return [
    toolCalls,
    schedule,
    markToolsAsSubmitted,
    setToolCalls,
    cancelAll,
    lastToolOutputTime,
  ];
}
