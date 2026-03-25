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
  LegacyAgentSession,
  geminiPartsToContentParts,
  parseThought,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import {
  type Config,
  type GeminiClient,
  type ApprovalMode,
  Kind,
  type EditorType,
  type ThoughtSummary,
  type RetryAttemptPayload,
  type AgentEvent,
  BaseDeclarativeTool,
  type ToolResult,
} from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  LoopDetectionConfirmationRequest,
  SlashCommandProcessorResult,
} from '../types.js';
import { StreamingState, MessageType } from '../types.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { getToolGroupBorderAppearance } from '../utils/borderStyles.js';
import { type BackgroundShell } from './shellCommandProcessor.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import { mapToDisplay as mapTrackedToolCallsToDisplay } from './toolMapping.js';
import { useToolScheduler } from './useToolScheduler.js';
import type { TrackedToolCall } from './useToolScheduler.js';

import { useSessionStats } from '../contexts/SessionContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { useStateAndRef } from './useStateAndRef.js';

class DummyTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    name: string,
    description: string,
    displayName: string,
    isOutputMarkdown: boolean,
    kind: Kind,
    messageBus: import('@google/gemini-cli-core').MessageBus,
  ) {
    super(
      name,
      displayName,
      description,
      kind,
      undefined,
      messageBus,
      isOutputMarkdown,
      false,
    );
  }
  protected createInvocation(params: Record<string, unknown>) {
    return {
      getDescription: () => this.description,
      params,
      execute: async () => ({ llmContent: [], returnDisplay: '' }),
      toolLocations: () => [],
      shouldConfirmExecute: async (): Promise<false> => false,
    };
  }
}

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
  _setModelSwitchedFromQuotaError: React.Dispatch<
    React.SetStateAction<boolean>
  >,
  onCancelSubmit: (shouldRestorePrompt?: boolean) => void,
  _setShellInputFocused: (value: boolean) => void,
  _terminalWidth: number,
  _terminalHeight: number,
  _isShellFocused?: boolean,
  _consumeUserHint?: () => string | null,
) => {
  const [initError] = useState<string | null>(null);
  const [retryStatus] = useState<RetryAttemptPayload | null>(null);
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

  const [trackedTools, , setTrackedTools] = useStateAndRef<TrackedToolCall[]>(
    [],
  );
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
  const backgroundShells = useMemo(
    () => new Map<number, BackgroundShell>(),
    [],
  );
  const dismissBackgroundShell = useCallback(async (_pid: number) => {}, []);

  // TODO: Support LoopDetection confirmation requests
  const [loopDetectionConfirmationRequest] =
    useState<LoopDetectionConfirmationRequest | null>(null);

  const flushPendingText = useCallback(() => {
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, userMessageTimestampRef.current);
      setPendingHistoryItem(null);
      geminiMessageBufferRef.current = '';
    }
  }, [addItem, pendingHistoryItemRef, setPendingHistoryItem]);

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
          flushPendingText();
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
        case 'tool_request': {
          flushPendingText();
          const legacyState = event._meta?.legacyState;
          const displayName = legacyState?.displayName ?? event.name;
          const isOutputMarkdown = legacyState?.isOutputMarkdown ?? false;
          const desc = legacyState?.description ?? '';

          const args =
            event.args && typeof event.args === 'object' ? event.args : {};
          const fallbackKind = Kind.Other;
          const messageBus = config.getMessageBus();

          const tool =
            config.getToolRegistry().getTool(event.name) ||
            new DummyTool(
              event.name,
              desc,
              displayName,
              isOutputMarkdown,
              fallbackKind,
              messageBus,
            );
          const invocation = tool.build(args);

          const newCall: TrackedToolCall = {
            request: {
              callId: event.requestId,
              name: event.name,
              args,
              isClientInitiated: false,
              originalRequestName: event.name,
              prompt_id: '',
            },
            status: CoreToolCallStatus.Scheduled,
            tool,
            invocation,
          };
          setTrackedTools((prev) => [...prev, newCall]);
          break;
        }
        case 'tool_update': {
          setTrackedTools((prev) =>
            prev.map((tc): TrackedToolCall => {
              if (tc.request.callId !== event.requestId) return tc;

              const legacyState = event._meta?.legacyState;
              const evtStatus = legacyState?.status;

              let status = tc.status;
              if (evtStatus === 'executing')
                status = CoreToolCallStatus.Executing;
              else if (evtStatus === 'error') status = CoreToolCallStatus.Error;
              else if (evtStatus === 'success')
                status = CoreToolCallStatus.Success;

              const liveOutput =
                event.displayContent?.[0]?.type === 'text'
                  ? event.displayContent[0].text
                  : 'liveOutput' in tc
                    ? tc.liveOutput
                    : undefined;
              const progressMessage =
                legacyState?.progressMessage ??
                ('progressMessage' in tc ? tc.progressMessage : undefined);
              const progress =
                legacyState?.progress ??
                ('progress' in tc ? tc.progress : undefined);
              const progressTotal =
                legacyState?.progressTotal ??
                ('progressTotal' in tc ? tc.progressTotal : undefined);
              const pid =
                legacyState?.pid ?? ('pid' in tc ? tc.pid : undefined);
              const desc =
                legacyState?.description ??
                ('invocation' in tc && tc.invocation
                  ? tc.invocation.getDescription()
                  : '');
              const invocation =
                'invocation' in tc && tc.invocation
                  ? { ...tc.invocation, getDescription: () => desc }
                  : undefined;

              const inProgressFields = {
                pid,
                liveOutput,
                progress,
                progressTotal,
                progressMessage,
                invocation,
              };

              const response =
                'response' in tc && tc.response
                  ? tc.response
                  : { callId: tc.request.callId, responseParts: [] };
              const responseSubmittedToGemini =
                'responseSubmittedToGemini' in tc
                  ? tc.responseSubmittedToGemini
                  : false;

              switch (status) {
                case CoreToolCallStatus.Executing:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.Executing,
                  };
                case CoreToolCallStatus.Error:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.Error,
                    response,
                    responseSubmittedToGemini,
                  };
                case CoreToolCallStatus.Success:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.Success,
                    response,
                    responseSubmittedToGemini,
                  };
                case CoreToolCallStatus.Scheduled:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.Scheduled,
                  };
                case CoreToolCallStatus.Validating:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.Validating,
                  };
                case CoreToolCallStatus.AwaitingApproval:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.AwaitingApproval,
                  };
                case CoreToolCallStatus.Cancelled:
                  return {
                    ...tc,
                    ...inProgressFields,
                    status: CoreToolCallStatus.Cancelled,
                  };
                default:
                  return tc;
              }
            }),
          );
          break;
        }
        case 'tool_response': {
          setTrackedTools((prev) =>
            prev.map((tc): TrackedToolCall => {
              if (tc.request.callId !== event.requestId) return tc;

              const legacyState = event._meta?.legacyState;
              const outputFile = legacyState?.outputFile;
              const resultDisplay =
                event.displayContent?.[0]?.type === 'text'
                  ? event.displayContent[0].text
                  : undefined;

              const response = {
                callId: tc.request.callId,
                responseParts: [],
                resultDisplay,
                outputFile,
                ...(event.isError
                  ? { error: 'Tool error', errorType: 'UNKNOWN' }
                  : {}),
              };

              if (event.isError) {
                return {
                  ...tc,
                  status: CoreToolCallStatus.Error,
                  response,
                  responseSubmittedToGemini: true,
                };
              } else {
                return {
                  ...tc,
                  status: CoreToolCallStatus.Success,
                  response,
                  responseSubmittedToGemini: true,
                };
              }
            }),
          );
          break;
        }
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
    [addItem, flushPendingText, setPendingHistoryItem, setTrackedTools, config],
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
      query: Array<import('@google/gemini-cli-core').Part> | string,
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
        typeof query === 'string' ? [{ text: query }] : query,
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
        toolsToPush[toolsToPush.length - 1] ===
        trackedTools[trackedTools.length - 1];

      const historyItem = mapTrackedToolCallsToDisplay(toolsToPush, {
        borderTop: isFirstToolInGroupRef.current,
        borderBottom: isLastInBatch,
        ...getToolGroupBorderAppearance(
          { type: 'tool_group', tools: trackedTools },
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
      { type: 'tool_group', tools: trackedTools },
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
    activePtyId,
    _isShellFocused,
    backgroundShells,
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
