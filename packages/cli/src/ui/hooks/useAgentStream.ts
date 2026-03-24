/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  getErrorMessage,
  MessageSenderType,
  ApprovalMode,
  debugLogger,
  LegacyAgentSession,
  geminiPartsToContentParts,
  parseThought,
} from '@google/gemini-cli-core';
import type {
  Config,
  EditorType,
  GeminiClient,
  ThoughtSummary,
  RetryAttemptPayload,
  AgentEvent,
} from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  LoopDetectionConfirmationRequest,
} from '../types.js';
import { StreamingState, MessageType } from '../types.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { getToolGroupBorderAppearance } from '../utils/borderStyles.js';
import { type BackgroundShell } from './shellCommandProcessor.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import { mapToDisplay as mapTrackedToolCallsToDisplay } from './toolMapping.js';
import {
  useToolScheduler,
} from './useToolScheduler.js';
import type {
  TrackedToolCall,
} from './useToolScheduler.js';

import { useSessionStats } from '../contexts/SessionContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { SlashCommandProcessorResult } from '../types.js';
import { useStateAndRef } from './useStateAndRef.js';

/**
 * useAgentStream implements the interactive agent loop using the LegacyAgentSession (AgentProtocol).
 * It attempts to maintain parity with useGeminiStream while consolidating model/tool orchestration
 * into the unified core API.
 */
export const useAgentStream = (
  geminiClient: GeminiClient,
  _history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  config: Config,
  _settings: LoadedSettings,
  _onDebugMessage: (message: string) => void,
  _handleSlashCommand: (
    cmd: PartListUnion,
  ) => Promise<SlashCommandProcessorResult | false>,
  _shellModeActive: boolean,
  getPreferredEditor: () => EditorType | undefined,
  _onAuthError: (error: string) => void,
  _performMemoryRefresh: () => Promise<void>,
  _modelSwitchedFromQuotaError: boolean,
  _setModelSwitchedFromQuotaError: React.Dispatch<React.SetStateAction<boolean>>,
  onCancelSubmit: (shouldRestorePrompt?: boolean) => void,
  _setShellInputFocused: (value: boolean) => void,
  _terminalWidth: number,
  _terminalHeight: number,
  _isShellFocused?: boolean,
  _consumeUserHint?: () => string | null,
) => {
  const [initError] = useState<string | null>(null);
  const [retryStatus] = useState<RetryAttemptPayload | null>(
    null,
  );
  const [streamingState, setStreamingState] = useState<StreamingState>(
    StreamingState.Idle,
  );
  const [thought, setThought] = useState<ThoughtSummary | null>(null);

  // Track the current session instance
  const sessionRef = useRef<LegacyAgentSession | null>(null);
  const currentStreamIdRef = useRef<string | null>(null);
  const userMessageTimestampRef = useRef<number>(0);
  const geminiMessageBufferRef = useRef<string>('');
  const [pendingHistoryItem, pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);

  const [trackedTools, , setTrackedTools] =
    useStateAndRef<TrackedToolCall[]>([]);
  const [pushedToolCallIds, pushedToolCallIdsRef, setPushedToolCallIds] =
    useStateAndRef<Set<string>>(new Set());
  const [_isFirstToolInGroup, isFirstToolInGroupRef, setIsFirstToolInGroup] =
    useStateAndRef<boolean>(true);

  const [
    toolCalls,
    _schedule,
    _markToolsAsSubmitted,
    _setToolCallsForDisplay,
    cancelAllToolCalls,
    lastOutputTime,
    scheduler,
  ] = useToolScheduler(
    async (_completedTools) => {
      // LegacyAgentSession owns the loop, so we don't need to trigger next turns here.
    },
    config,
    getPreferredEditor,
  );

  const { startNewPrompt } = useSessionStats();
  const logger = useLogger(config.storage);

  const activePtyId = undefined;
  const backgroundShellCount = 0;
  const isBackgroundShellVisible = false;
  const toggleBackgroundShell = useCallback(() => {}, []);
  const backgroundCurrentShell = undefined;
  const backgroundShells = new Map<number, BackgroundShell>();
  const dismissBackgroundShell = useCallback(async (_pid: number) => {}, []);

  // TODO: Support LoopDetection confirmation requests
  const [
    loopDetectionConfirmationRequest,
  ] = useState<LoopDetectionConfirmationRequest | null>(null);

  const cancelOngoingRequest = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.abort();
      cancelAllToolCalls(new AbortController().signal);
      setStreamingState(StreamingState.Idle);
      onCancelSubmit(false);
    }
  }, [cancelAllToolCalls, onCancelSubmit]);

  // TODO: Support native handleApprovalModeChange for Plan Mode
  const handleApprovalModeChange = useCallback(
    async (newApprovalMode: ApprovalMode) => {
      debugLogger.debug(`Approval mode changed to ${newApprovalMode} (stub)`);
    },
    [],
  );

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'agent_start':
          setStreamingState(StreamingState.Responding);
          break;
        case 'agent_end':
          setStreamingState(StreamingState.Idle);
          if (pendingHistoryItemRef.current) {
            addItem(
              pendingHistoryItemRef.current,
              userMessageTimestampRef.current,
            );
            setPendingHistoryItem(null);
          }
          break;
        case 'message':
          if (event.role === 'agent') {
            for (const part of event.content) {
              if (part.type === 'text') {
                geminiMessageBufferRef.current += part.text;
                // Update pending history item with incremental text
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
          setTrackedTools((prev) => [
            ...prev,
            {
              request: {
                callId: event.requestId,
                name: event.name,
                args: event.args,
                isClientInitiated: false,
                originalRequestName: event.name,
              },
              status: 'executing',
              tool: {
                displayName: (event._meta?.['displayName'] as string) ?? event.name,
                isOutputMarkdown: (event._meta?.['isOutputMarkdown'] as boolean) ?? false,
                kind: event._meta?.['kind'] as any,
              },
              invocation: {
                getDescription: () => (event._meta?.['description'] as string) ?? '',
              },
            } as unknown as TrackedToolCall,
          ]);
          break;
        case 'tool_update':
          setTrackedTools((prev) =>
            prev.map((tc) =>
              tc.request.callId === event.requestId
                ? ({
                    ...tc,
                    liveOutput: event.displayContent?.[0]?.type === 'text' ? event.displayContent[0].text : undefined,
                    progressMessage: event.data?.['progressMessage'] as string | undefined,
                    progress: event.data?.['progress'] as number | undefined,
                    progressTotal: event.data?.['progressTotal'] as number | undefined,
                    pid: event.data?.['pid'] as number | undefined,
                    invocation: {
                      getDescription: () => (event._meta?.['description'] as string) ?? (tc as any).invocation?.getDescription(),
                    },
                  } as unknown as TrackedToolCall)
                : tc,
            ),
          );
          break;
        case 'tool_response':
          setTrackedTools((prev) =>
            prev.map((tc) =>
              tc.request.callId === event.requestId
                ? ({
                    ...tc,
                    status: event.isError ? 'error' : 'success',
                    response: {
                      resultDisplay: event._meta?.['resultDisplay'] ?? (event.displayContent?.[0]?.type === 'text' ? event.displayContent[0].text : undefined),
                      outputFile: event._meta?.['outputFile'] as string | undefined,
                    },
                    responseSubmittedToGemini: true,
                  } as unknown as TrackedToolCall)
                : tc,
            ),
          );
          break;
        case 'error':
          addItem(
            { type: MessageType.ERROR, text: event.message },
            userMessageTimestampRef.current,
          );
          break;
        default:
          break;
      }
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  useEffect(() => {
    if (sessionRef.current) {
      return sessionRef.current.subscribe(handleEvent);
    }
    return undefined;
  }, [handleEvent]);

  // Handle initialization of the session
  if (!sessionRef.current) {
    sessionRef.current = new LegacyAgentSession({
      client: geminiClient,
      scheduler,
      config,
      promptId: '',
    });
  }

  const submitQuery = useCallback(
    async (
      query: PartListUnion,
      options?: { isContinuation: boolean },
      _prompt_id?: string,
    ) => {
      if (!sessionRef.current) return;

      const timestamp = Date.now();
      userMessageTimestampRef.current = timestamp;
      geminiMessageBufferRef.current = '';

      if (!options?.isContinuation) {
        if (typeof query === 'string') {
          addItem({ type: MessageType.USER, text: query }, timestamp);
          void logger?.logMessage(MessageSenderType.USER, query);
        }
        startNewPrompt();
      }

      const parts = geminiPartsToContentParts(
        typeof query === 'string' ? [{ text: query }] : (query as any[]),
      );

      try {
        const { streamId } = await sessionRef.current.send({
          message: parts,
        });
        currentStreamIdRef.current = streamId;
      } catch (err) {
        addItem(
          { type: MessageType.ERROR, text: getErrorMessage(err) },
          timestamp,
        );
      }
    },
    [addItem, logger, startNewPrompt],
  );

  useEffect(() => {
    if (trackedTools.length > 0) {
      const isNewBatch = !trackedTools.some((tc) =>
        pushedToolCallIdsRef.current.has(tc.request.callId),
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

  // Push completed tools to history
  useEffect(() => {
    const toolsToPush: TrackedToolCall[] = [];
    for (let i = 0; i < trackedTools.length; i++) {
      const tc = trackedTools[i];
      if (pushedToolCallIdsRef.current.has(tc.request.callId)) continue;

      if (
        tc.status === 'success' ||
        tc.status === 'error' ||
        tc.status === 'cancelled'
      ) {
        toolsToPush.push(tc);
      } else {
        break;
      }
    }

    if (toolsToPush.length > 0) {
      const newPushed = new Set(pushedToolCallIdsRef.current);
      for (const tc of toolsToPush) {
        newPushed.add(tc.request.callId);
      }

      const isLastInBatch =
        toolsToPush[toolsToPush.length - 1] === trackedTools[trackedTools.length - 1];

      const historyItem = mapTrackedToolCallsToDisplay(toolsToPush, {
        borderTop: isFirstToolInGroupRef.current,
        borderBottom: isLastInBatch,
        ...getToolGroupBorderAppearance(
          { type: 'tool_group', tools: trackedTools as any[] },
          activePtyId,
          !!_isShellFocused,
          [],
          backgroundShells,
        ),
      });

      addItem(historyItem);
      setPushedToolCallIds(newPushed);
      setIsFirstToolInGroup(false);
    }
  }, [
    trackedTools,
    pushedToolCallIdsRef,
    isFirstToolInGroupRef,
    setPushedToolCallIds,
    setIsFirstToolInGroup,
    addItem,
    activePtyId,
    _isShellFocused,
    backgroundShells,
  ]);

  const pendingToolGroupItems = useMemo((): HistoryItemWithoutId[] => {
    const remainingTools = trackedTools.filter(
      (tc) => !pushedToolCallIds.has(tc.request.callId),
    );

    const items: HistoryItemWithoutId[] = [];

    const appearance = getToolGroupBorderAppearance(
      { type: 'tool_group', tools: trackedTools as any[] },
      activePtyId,
      !!_isShellFocused,
      [],
      backgroundShells,
    );

    if (remainingTools.length > 0) {
      items.push(
        mapTrackedToolCallsToDisplay(remainingTools, {
          borderTop: pushedToolCallIds.size === 0,
          borderBottom: false,
          ...appearance,
        }),
      );
    }

    const allTerminal =
      trackedTools.length > 0 &&
      trackedTools.every(
        (tc) =>
          tc.status === 'success' ||
          tc.status === 'error' ||
          tc.status === 'cancelled',
      );

    const allPushed =
      trackedTools.length > 0 &&
      trackedTools.every((tc) => pushedToolCallIds.has(tc.request.callId));

    const anyVisibleInHistory = pushedToolCallIds.size > 0;
    const anyVisibleInPending = remainingTools.length > 0;

    if (
      trackedTools.length > 0 &&
      !(allTerminal && allPushed) &&
      (anyVisibleInHistory || anyVisibleInPending)
    ) {
      items.push({
        type: 'tool_group' as const,
        tools: [],
        borderTop: false,
        borderBottom: true,
        ...appearance,
      });
    }

    return items;
  }, [
    trackedTools,
    pushedToolCallIds,
    isFirstToolInGroupRef,
    activePtyId,
    _isShellFocused,
    backgroundShells,
  ]);

  const pendingHistoryItems = useMemo(() => {
    return [pendingHistoryItem, ...pendingToolGroupItems].filter(
      (i): i is HistoryItemWithoutId => i !== undefined && i !== null,
    );
  }, [pendingHistoryItem, pendingToolGroupItems]);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
    cancelOngoingRequest,
    pendingToolCalls: toolCalls,
    handleApprovalModeChange,
    activePtyId,
    loopDetectionConfirmationRequest,
    lastOutputTime,
    backgroundShellCount,
    isBackgroundShellVisible,
    toggleBackgroundShell,
    backgroundCurrentShell,
    backgroundShells,
    retryStatus,
    dismissBackgroundShell,
  };
};
