/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  getErrorMessage,
  MessageSenderType,
  debugLogger,
  geminiPartsToContentParts,
  parseThought,
  CoreToolCallStatus,
  ApprovalMode,
  type ThoughtSummary,
  type RetryAttemptPayload,
  type AgentEvent,
  type AgentProtocol,
  type Logger,
  type Part,
  type Config,
  MessageBusType,
  ToolConfirmationOutcome,
  EDIT_TOOL_NAMES,
  getPlanModeExitMessage,
  type ToolCall,
  type ToolCallsUpdateMessage,
  type WaitingToolCall,
} from '@google/gemini-cli-core';
import type {
  HistoryItemWithoutId,
  LoopDetectionConfirmationRequest,
  IndividualToolCallDisplay,
  HistoryItemToolDisplayGroup,
} from '../types.js';
import { StreamingState, MessageType } from '../types.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { getToolGroupBorderAppearance } from '../utils/borderStyles.js';
import {
  useExecutionLifecycle,
  type BackgroundTask,
} from './useExecutionLifecycle.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useStateAndRef } from './useStateAndRef.js';
import { type MinimalTrackedToolCall } from './useTurnActivityMonitor.js';
import { useKeypress } from './useKeypress.js';
import { mapToDisplay } from './toolMapping.js';

export interface UseAgentStreamOptions {
  agent?: AgentProtocol;
  config: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onCancelSubmit: (
    shouldRestorePrompt?: boolean,
    clearBuffer?: boolean,
  ) => void;
  onDebugMessage: (message: string) => void;
  setShellInputFocused: (value: boolean) => void;
  terminalWidth?: number;
  terminalHeight?: number;
  isShellFocused?: boolean;
  logger?: Logger | null;
}

const LOOP_DETECTED_INFO =
  'A potential loop was detected. This can happen due to repetitive tool calls or other model behavior. The request has been halted.';

function calculateStreamingState(
  isResponding: boolean,
  toolCalls: IndividualToolCallDisplay[],
): StreamingState {
  if (
    toolCalls.some((tc) => tc.status === CoreToolCallStatus.AwaitingApproval)
  ) {
    return StreamingState.WaitingForConfirmation;
  }

  const isAnyToolActive = toolCalls.some((tc) => {
    if (
      tc.status === CoreToolCallStatus.Executing ||
      tc.status === CoreToolCallStatus.Scheduled ||
      tc.status === CoreToolCallStatus.Validating
    ) {
      return true;
    }

    return false;
  });

  if (isResponding || isAnyToolActive) {
    return StreamingState.Responding;
  }

  return StreamingState.Idle;
}

/**
 * useAgentStream implements the interactive agent loop using an AgentProtocol.
 * It is completely agnostic to the specific agent implementation.
 */
export const useAgentStream = ({
  agent,
  config,
  addItem,
  onCancelSubmit,
  onDebugMessage,
  setShellInputFocused,
  terminalWidth,
  terminalHeight,
  isShellFocused,
  logger,
}: UseAgentStreamOptions) => {
  const [initError] = useState<string | null>(null);
  const [retryStatus] = useState<RetryAttemptPayload | null>(null);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [lastOutputTime, setLastOutputTime] = useState<number>(Date.now());

  const currentStreamIdRef = useRef<string | null>(null);
  const userMessageTimestampRef = useRef<number>(0);
  const geminiMessageBufferRef = useRef<string>('');
  const lastQueryRef = useRef<Part[] | string | null>(null);
  const previousApprovalModeRef = useRef<ApprovalMode>(
    config.getApprovalMode(),
  );
  const [pendingHistoryItem, pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const [
    loopDetectionConfirmationRequest,
    setLoopDetectionConfirmationRequest,
  ] = useState<LoopDetectionConfirmationRequest | null>(null);
  const [
    toolCallsByScheduler,
    toolCallsBySchedulerRef,
    setToolCallsByScheduler,
  ] = useStateAndRef<Record<string, ToolCall[]>>({});
  const [trackedTools, , setTrackedTools] = useStateAndRef<
    IndividualToolCallDisplay[]
  >([]);
  const [pushedToolCallIds, pushedToolCallIdsRef, setPushedToolCallIds] =
    useStateAndRef<Set<string>>(new Set());
  const [_isFirstToolInGroup, isFirstToolInGroupRef, setIsFirstToolInGroup] =
    useStateAndRef<boolean>(true);
  const [_hasEmittedBoxInTurn, hasEmittedBoxInTurnRef, setHasEmittedBoxInTurn] =
    useStateAndRef<boolean>(false);

  const { startNewPrompt } = useSessionStats();

  const flattenedToolCalls = useMemo(
    () => Object.values(toolCallsByScheduler).flat(),
    [toolCallsByScheduler],
  );
  const activeBackgroundExecutionId = useMemo(
    () =>
      flattenedToolCalls.find(
        (
          call,
        ): call is ToolCall & {
          status: CoreToolCallStatus.Executing;
          pid: number;
        } =>
          call.status === CoreToolCallStatus.Executing &&
          typeof call.pid === 'number',
      )?.pid,
    [flattenedToolCalls],
  );

  const onExec = useCallback(async (done: Promise<void>) => {
    await done;
  }, []);

  const {
    activeShellPtyId,
    lastShellOutputTime,
    backgroundTaskCount,
    isBackgroundTaskVisible,
    toggleBackgroundTasks,
    backgroundCurrentExecution,
    dismissBackgroundTask,
    backgroundTasks,
  } = useExecutionLifecycle(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
    config.getGeminiClient(),
    setShellInputFocused,
    terminalWidth,
    terminalHeight,
    activeBackgroundExecutionId,
    calculateStreamingState(isResponding, trackedTools) ===
      StreamingState.WaitingForConfirmation,
  );

  const activePtyId = activeShellPtyId ?? activeBackgroundExecutionId;
  const streamingState = useMemo(
    () => calculateStreamingState(isResponding, trackedTools),
    [isResponding, trackedTools],
  );
  const effectiveLastOutputTime = Math.max(lastOutputTime, lastShellOutputTime);

  const visibleTrackedTools = useMemo(
    () =>
      trackedTools.filter(
        (tool) =>
          tool.status !== CoreToolCallStatus.AwaitingApproval &&
          tool.display?.format !== 'hidden',
      ),
    [trackedTools],
  );

  const pendingToolCalls = useMemo(
    (): MinimalTrackedToolCall[] =>
      trackedTools.map((t) => ({
        request: {
          name: t.originalRequestName || t.name,
          args: { command: t.description },
          callId: t.callId,
          isClientInitiated: t.isClientInitiated ?? false,
          prompt_id: '',
        },
        status: t.status,
      })),
    [trackedTools],
  );

  const flushPendingText = useCallback(() => {
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, userMessageTimestampRef.current);
      setPendingHistoryItem(null);
      geminiMessageBufferRef.current = '';
    }
  }, [addItem, pendingHistoryItemRef, setPendingHistoryItem]);

  const cancelOngoingRequest = useCallback(
    async (clearBuffer: boolean = true) => {
      if (agent) {
        await agent.abort();
        setIsResponding(false);
        onCancelSubmit(false, clearBuffer);
      }
    },
    [agent, onCancelSubmit],
  );

  const submitQuery = useCallback(
    async (
      query: Part[] | string,
      options?: { isContinuation: boolean },
      _prompt_id?: string,
    ) => {
      if (!agent) return;

      const timestamp = Date.now();
      setLastOutputTime(timestamp);
      userMessageTimestampRef.current = timestamp;
      lastQueryRef.current = query;

      geminiMessageBufferRef.current = '';

      if (!options?.isContinuation) {
        if (typeof query === 'string') {
          addItem({ type: MessageType.USER, text: query }, timestamp);
          void logger?.logMessage(MessageSenderType.USER, query);
        }
        startNewPrompt();
      }

      const parts = geminiPartsToContentParts(
        typeof query === 'string' ? [{ text: query }] : query,
      );

      try {
        const { streamId } = await agent.send({
          message: { content: parts },
        });
        currentStreamIdRef.current = streamId;
      } catch (err) {
        addItem(
          { type: MessageType.ERROR, text: getErrorMessage(err) },
          timestamp,
        );
      }
    },
    [agent, addItem, logger, startNewPrompt],
  );

  const handleApprovalModeChange = useCallback(
    async (newApprovalMode: ApprovalMode) => {
      if (
        previousApprovalModeRef.current === ApprovalMode.PLAN &&
        newApprovalMode !== ApprovalMode.PLAN &&
        streamingState === StreamingState.Idle
      ) {
        try {
          await config.getGeminiClient().addHistory({
            role: 'user',
            parts: [{ text: getPlanModeExitMessage(newApprovalMode, true) }],
          });
        } catch (error) {
          onDebugMessage(
            `Failed to notify model of Plan Mode exit: ${getErrorMessage(error)}`,
          );
          addItem({
            type: MessageType.ERROR,
            text: 'Failed to update the model about exiting Plan Mode. The model might be out of sync. Please consider restarting the session if you see unexpected behavior.',
          });
        }
      }
      previousApprovalModeRef.current = newApprovalMode;

      if (
        newApprovalMode !== ApprovalMode.YOLO &&
        newApprovalMode !== ApprovalMode.AUTO_EDIT
      ) {
        return;
      }

      let awaitingApprovalCalls = Object.values(toolCallsBySchedulerRef.current)
        .flat()
        .filter(
          (call): call is WaitingToolCall =>
            call.status === CoreToolCallStatus.AwaitingApproval &&
            !call.request.forcedAsk,
        );

      if (newApprovalMode === ApprovalMode.AUTO_EDIT) {
        awaitingApprovalCalls = awaitingApprovalCalls.filter((call) =>
          EDIT_TOOL_NAMES.has(call.request.name),
        );
      }

      for (const call of awaitingApprovalCalls) {
        if (!call.correlationId) {
          continue;
        }
        try {
          await config.getMessageBus().publish({
            type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
            correlationId: call.correlationId,
            confirmed: true,
            requiresUserConfirmation: false,
            outcome: ToolConfirmationOutcome.ProceedOnce,
          });
        } catch (error) {
          debugLogger.warn(
            `Failed to auto-approve tool call ${call.request.callId}:`,
            error,
          );
        }
      }
    },
    [addItem, config, onDebugMessage, streamingState, toolCallsBySchedulerRef],
  );

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      setLastOutputTime(Date.now());
      switch (event.type) {
        case 'agent_start':
          setIsResponding(true);
          break;
        case 'agent_end':
          setIsResponding(false);
          flushPendingText();
          break;
        case 'message':
          if (event.role === 'agent') {
            for (const part of event.content) {
              if (part.type === 'text') {
                geminiMessageBufferRef.current += part.text;
                const splitPoint = findLastSafeSplitPoint(
                  geminiMessageBufferRef.current,
                );
                if (splitPoint === geminiMessageBufferRef.current.length) {
                  setPendingHistoryItem({
                    type: 'gemini',
                    text: geminiMessageBufferRef.current,
                  });
                } else {
                  const before = geminiMessageBufferRef.current.substring(
                    0,
                    splitPoint,
                  );
                  const after =
                    geminiMessageBufferRef.current.substring(splitPoint);
                  addItem(
                    { type: 'gemini', text: before },
                    userMessageTimestampRef.current,
                  );
                  geminiMessageBufferRef.current = after;
                  setPendingHistoryItem({
                    type: 'gemini_content',
                    text: after,
                  });
                }
              } else if (part.type === 'thought') {
                setThought(parseThought(part.thought));
              }
            }
          }
          break;
        case 'tool_request':
          flushPendingText();
          break;
        case 'tool_update':
        case 'tool_response':
          break;
        case 'error': {
          if (event._meta?.['code'] === 'LOOP_DETECTED') {
            flushPendingText();
            setLoopDetectionConfirmationRequest({
              onComplete: async (result: {
                userSelection: 'disable' | 'keep';
              }) => {
                setLoopDetectionConfirmationRequest(null);

                if (result.userSelection === 'disable') {
                  config
                    .getGeminiClient()
                    .getLoopDetectionService()
                    .disableForSession();
                  addItem({
                    type: MessageType.INFO,
                    text: 'Loop detection has been disabled for this session. Retrying request...',
                  });
                  if (lastQueryRef.current) {
                    await submitQuery(lastQueryRef.current, {
                      isContinuation: true,
                    });
                  }
                  return;
                }

                addItem({
                  type: MessageType.INFO,
                  text: LOOP_DETECTED_INFO,
                });
              },
            });
            break;
          }

          const message =
            event._meta?.['code'] === 'AGENT_EXECUTION_BLOCKED'
              ? `Agent execution blocked: ${event.message}`
              : event.message;
          addItem(
            { type: MessageType.ERROR, text: message },
            userMessageTimestampRef.current,
          );
          break;
        }
        case 'initialize':
        case 'session_update':
        case 'elicitation_request':
        case 'elicitation_response':
        case 'usage':
        case 'custom':
          break;
        default:
          debugLogger.error('Unknown agent event type:', event);
          event satisfies never;
          break;
      }
    },
    [
      addItem,
      config,
      flushPendingText,
      submitQuery,
      setPendingHistoryItem,
      setThought,
    ],
  );

  useEffect(() => {
    const unsubscribe = agent?.subscribe(handleEvent);
    return () => unsubscribe?.();
  }, [agent, handleEvent]);

  useEffect(() => {
    const messageBus = config.getMessageBus();
    const handleToolCallsUpdate = (event: ToolCallsUpdateMessage) => {
      setToolCallsByScheduler((prev) => {
        const next = { ...prev };
        if (event.toolCalls.length === 0) {
          delete next[event.schedulerId];
        } else {
          next[event.schedulerId] = event.toolCalls;
        }
        return next;
      });
    };

    messageBus.subscribe(
      MessageBusType.TOOL_CALLS_UPDATE,
      handleToolCallsUpdate,
    );
    return () => {
      messageBus.unsubscribe(
        MessageBusType.TOOL_CALLS_UPDATE,
        handleToolCallsUpdate,
      );
    };
  }, [config, setToolCallsByScheduler]);

  useEffect(() => {
    const mappedTools =
      flattenedToolCalls.length > 0
        ? mapToDisplay(flattenedToolCalls).tools
        : [];
    setTrackedTools(mappedTools);
  }, [flattenedToolCalls, setTrackedTools]);

  useKeypress(
    (key) => {
      if (key.name === 'escape' && !isShellFocused) {
        void cancelOngoingRequest(false);
        return true;
      }
      return false;
    },
    {
      isActive:
        streamingState === StreamingState.Responding ||
        streamingState === StreamingState.WaitingForConfirmation,
    },
  );

  useEffect(() => {
    if (trackedTools.length > 0) {
      const isNewBatch = !trackedTools.some((tc) =>
        pushedToolCallIdsRef.current.has(tc.callId),
      );
      if (isNewBatch) {
        setPushedToolCallIds(new Set());
        setIsFirstToolInGroup(true);
      }
    } else if (streamingState === StreamingState.Idle) {
      setPushedToolCallIds(new Set());
      setIsFirstToolInGroup(true);
    }
  }, [
    trackedTools,
    pushedToolCallIdsRef,
    setPushedToolCallIds,
    setIsFirstToolInGroup,
    streamingState,
  ]);

  useEffect(() => {
    if (visibleTrackedTools.length === 0) return;

    const allTerminal = visibleTrackedTools.every(
      (tc) =>
        tc.status === 'success' ||
        tc.status === 'error' ||
        tc.status === 'cancelled',
    );

    const toolsToPush = visibleTrackedTools.filter(
      (tc) => !pushedToolCallIdsRef.current.has(tc.callId),
    );

    if (allTerminal && toolsToPush.length > 0) {
      const newPushed = new Set(pushedToolCallIdsRef.current);
      for (const tc of toolsToPush) {
        newPushed.add(tc.callId);
      }

      const appearance = getToolGroupBorderAppearance(
        { type: 'tool_group', tools: visibleTrackedTools },
        activePtyId,
        !!isShellFocused,
        [],
        backgroundTasks,
      );

      const hasBoxInBatch = toolsToPush.some(
        (tc) => tc.display?.format !== 'notice',
      );
      const shouldStartNewBlock =
        isFirstToolInGroupRef.current ||
        (!hasEmittedBoxInTurnRef.current && hasBoxInBatch);

      const historyItem: HistoryItemToolDisplayGroup = {
        type: 'tool_display_group',
        tools: toolsToPush.map((tc) => ({
          name: tc.name,
          description: tc.description,
          ...tc.display,
          status: tc.status,
          originalRequestName: tc.originalRequestName,
        })),
        borderTop: shouldStartNewBlock,
        borderBottom: true,
        ...appearance,
      };

      addItem(historyItem);
      setPushedToolCallIds(newPushed);

      if (hasBoxInBatch) {
        setHasEmittedBoxInTurn(true);
      }
      setIsFirstToolInGroup(false);
    }
  }, [
    visibleTrackedTools,
    pushedToolCallIdsRef,
    isFirstToolInGroupRef,
    hasEmittedBoxInTurnRef,
    setPushedToolCallIds,
    setIsFirstToolInGroup,
    setHasEmittedBoxInTurn,
    addItem,
    activePtyId,
    isShellFocused,
    backgroundTasks,
  ]);

  const pendingToolGroupItems = useMemo((): HistoryItemWithoutId[] => {
    const remainingTools = visibleTrackedTools.filter(
      (tc) => !pushedToolCallIdsRef.current.has(tc.callId),
    );

    const items: HistoryItemWithoutId[] = [];

    const appearance = getToolGroupBorderAppearance(
      { type: 'tool_group', tools: visibleTrackedTools },
      activePtyId,
      !!isShellFocused,
      [],
      backgroundTasks,
    );

    if (remainingTools.length > 0) {
      const hasBoxInPending = remainingTools.some(
        (tc) => tc.display?.format !== 'notice',
      );
      const shouldStartNewBlock =
        pushedToolCallIds.size === 0 ||
        (!hasEmittedBoxInTurnRef.current && hasBoxInPending);

      items.push({
        type: 'tool_display_group',
        tools: remainingTools.map((tc) => ({
          name: tc.name,
          description: tc.description,
          ...tc.display,
          status: tc.status,
          originalRequestName: tc.originalRequestName,
        })),
        borderTop: shouldStartNewBlock,
        borderBottom: false,
        ...appearance,
      });
    }

    const allTerminal =
      visibleTrackedTools.length > 0 &&
      visibleTrackedTools.every(
        (tc) =>
          tc.status === 'success' ||
          tc.status === 'error' ||
          tc.status === 'cancelled',
      );

    const allPushed =
      visibleTrackedTools.length > 0 &&
      visibleTrackedTools.every((tc) => pushedToolCallIds.has(tc.callId));

    const anyVisibleInHistory = pushedToolCallIds.size > 0;
    const anyVisibleInPending = remainingTools.length > 0;

    if (
      visibleTrackedTools.length > 0 &&
      !(allTerminal && allPushed) &&
      (anyVisibleInHistory || anyVisibleInPending)
    ) {
      items.push({
        type: 'tool_display_group',
        tools: [],
        borderTop: false,
        borderBottom: true,
        ...appearance,
      });
    }

    return items;
  }, [
    visibleTrackedTools,
    pushedToolCallIds,
    pushedToolCallIdsRef,
    hasEmittedBoxInTurnRef,
    activePtyId,
    isShellFocused,
    backgroundTasks,
  ]);

  const pendingHistoryItems = useMemo(
    () =>
      [pendingHistoryItem, ...pendingToolGroupItems].filter(
        (i): i is HistoryItemWithoutId => i !== undefined && i !== null,
      ),
    [pendingHistoryItem, pendingToolGroupItems],
  );

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
    cancelOngoingRequest,
    pendingToolCalls,
    handleApprovalModeChange,
    activePtyId,
    loopDetectionConfirmationRequest,
    lastOutputTime: effectiveLastOutputTime,
    backgroundTaskCount,
    isBackgroundTaskVisible,
    toggleBackgroundTasks,
    backgroundCurrentExecution,
    backgroundTasks,
    retryStatus,
    dismissBackgroundTask,
  };
};
