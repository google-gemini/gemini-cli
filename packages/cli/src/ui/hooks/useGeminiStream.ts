/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useInput } from 'ink';
import {
  GeminiClient,
  GeminiEventType as ServerGeminiEventType,
  ServerGeminiStreamEvent as GeminiEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiErrorEvent as ErrorEvent,
  getErrorMessage,
  isNodeError,
  Config,
  MessageSenderType,
  ToolCallRequestInfo,
  GeminiChat,
} from '@gemini-code/core';
import { type PartListUnion } from '@google/genai';
import {
  StreamingState,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  MessageType,
  ToolCallStatus,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { useStateAndRef } from './useStateAndRef.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import {
  useReactToolScheduler,
  mapToDisplay as mapTrackedToolCallsToDisplay,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';

export function mergePartListUnions(list: PartListUnion[]): PartListUnion {
  const resultParts: PartListUnion = [];
  for (const item of list) {
    if (Array.isArray(item)) {
      resultParts.push(...item);
    } else {
      resultParts.push(item);
    }
  }
  return resultParts;
}

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export const useGeminiStream = (
  addItem: UseHistoryManagerReturn['addItem'],
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  config: Config,
  onDebugMessage: (message: string) => void,
  handleSlashCommand: (
    cmd: PartListUnion,
  ) => import('./slashCommandProcessor.js').SlashCommandActionReturn | boolean,
  shellModeActive: boolean,
) => {
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatSessionRef = useRef<GeminiChat | null>(null);
  const geminiClientRef = useRef<GeminiClient | null>(null);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const logger = useLogger();

  const [
    toolCalls,
    scheduleToolCalls,
    cancelAllToolCalls,
    markToolsAsSubmitted,
  ] = useReactToolScheduler(
    (completedToolCallsFromScheduler) => {
      // This onComplete is called when ALL scheduled tools for a given batch are done.
      if (completedToolCallsFromScheduler.length > 0) {
        // Add the final state of these tools to the history for display.
        // The new useEffect will handle submitting their responses.
        addItem(
          mapTrackedToolCallsToDisplay(
            completedToolCallsFromScheduler as TrackedToolCall[],
          ),
          Date.now(),
        );
      }
    },
    config,
    setPendingHistoryItem,
  );

  const pendingToolCallGroupDisplay = useMemo(
    () =>
      toolCalls.length ? mapTrackedToolCallsToDisplay(toolCalls) : undefined,
    [toolCalls],
  );

  const onExec = useCallback(async (done: Promise<void>) => {
    setIsResponding(true);
    await done;
    setIsResponding(false);
  }, []);
  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
  );

  const streamingState = useMemo(() => {
    if (toolCalls.some((tc) => tc.status === 'awaiting_approval')) {
      return StreamingState.WaitingForConfirmation;
    }
    if (
      isResponding ||
      toolCalls.some(
        (tc) =>
          tc.status === 'executing' ||
          tc.status === 'scheduled' ||
          tc.status === 'validating',
      )
    ) {
      return StreamingState.Responding;
    }
    return StreamingState.Idle;
  }, [isResponding, toolCalls]);

  useEffect(() => {
    setInitError(null);
    if (!geminiClientRef.current) {
      try {
        geminiClientRef.current = new GeminiClient(config);
      } catch (error: unknown) {
        const errorMsg = `Failed to initialize client: ${getErrorMessage(error) || 'Unknown error'}`;
        setInitError(errorMsg);
        addItem({ type: MessageType.ERROR, text: errorMsg }, Date.now());
      }
    }
  }, [config, addItem]);

  useInput((_input, key) => {
    if (streamingState !== StreamingState.Idle && key.escape) {
      abortControllerRef.current?.abort();
      cancelAllToolCalls(); // Also cancel any pending/executing tool calls
    }
  });

  const prepareQueryForGemini = useCallback(
    async (
      query: PartListUnion,
      userMessageTimestamp: number,
      abortSignal: AbortSignal,
    ): Promise<{
      queryToSend: PartListUnion | null;
      shouldProceed: boolean;
    }> => {
      if (typeof query === 'string' && query.trim().length === 0) {
        return { queryToSend: null, shouldProceed: false };
      }

      let localQueryToSendToGemini: PartListUnion | null = null;

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        onDebugMessage(`User query: '${trimmedQuery}'`);
        await logger?.logMessage(MessageSenderType.USER, trimmedQuery);

        // Handle UI-only commands first
        const slashCommandResult = handleSlashCommand(trimmedQuery);
        if (typeof slashCommandResult === 'boolean' && slashCommandResult) {
          // Command was handled, and it doesn't require a tool call from here
          return { queryToSend: null, shouldProceed: false };
        } else if (
          typeof slashCommandResult === 'object' &&
          slashCommandResult.shouldScheduleTool
        ) {
          // Slash command wants to schedule a tool call (e.g., /memory add)
          const { toolName, toolArgs } = slashCommandResult;
          if (toolName && toolArgs) {
            const toolCallRequest: ToolCallRequestInfo = {
              callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: toolName,
              args: toolArgs,
            };
            scheduleToolCalls([toolCallRequest]);
          }
          return { queryToSend: null, shouldProceed: false }; // Handled by scheduling the tool
        }

        if (shellModeActive && handleShellCommand(trimmedQuery, abortSignal)) {
          return { queryToSend: null, shouldProceed: false };
        }

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleAtCommand({
            query: trimmedQuery,
            config,
            addItem,
            onDebugMessage,
            messageId: userMessageTimestamp,
            signal: abortSignal,
          });
          if (!atCommandResult.shouldProceed) {
            return { queryToSend: null, shouldProceed: false };
          }
          localQueryToSendToGemini = atCommandResult.processedQuery;
        } else {
          // Normal query for Gemini
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );
          localQueryToSendToGemini = trimmedQuery;
        }
      } else {
        // It's a function response (PartListUnion that isn't a string)
        localQueryToSendToGemini = query;
      }

      if (localQueryToSendToGemini === null) {
        onDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return { queryToSend: null, shouldProceed: false };
      }
      return { queryToSend: localQueryToSendToGemini, shouldProceed: true };
    },
    [
      config,
      addItem,
      onDebugMessage,
      handleShellCommand,
      handleSlashCommand,
      logger,
      shellModeActive,
      scheduleToolCalls,
    ],
  );

  const ensureChatSession = useCallback(async (): Promise<{
    client: GeminiClient | null;
    chat: GeminiChat | null;
  }> => {
    const currentClient = geminiClientRef.current;
    if (!currentClient) {
      const errorMsg = 'Gemini client is not available.';
      setInitError(errorMsg);
      addItem({ type: MessageType.ERROR, text: errorMsg }, Date.now());
      return { client: null, chat: null };
    }

    if (!chatSessionRef.current) {
      try {
        chatSessionRef.current = await currentClient.startChat();
      } catch (err: unknown) {
        const errorMsg = `Failed to start chat: ${getErrorMessage(err)}`;
        setInitError(errorMsg);
        addItem({ type: MessageType.ERROR, text: errorMsg }, Date.now());
        return { client: currentClient, chat: null };
      }
    }
    return { client: currentClient, chat: chatSessionRef.current };
  }, [addItem]);

  // --- Stream Event Handlers ---

  const handleContentEvent = useCallback(
    (
      eventValue: ContentEvent['value'],
      currentGeminiMessageBuffer: string,
      userMessageTimestamp: number,
    ): string => {
      let newGeminiMessageBuffer = currentGeminiMessageBuffer + eventValue;
      if (
        pendingHistoryItemRef.current?.type !== 'gemini' &&
        pendingHistoryItemRef.current?.type !== 'gemini_content'
      ) {
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem({ type: 'gemini', text: '' });
        newGeminiMessageBuffer = eventValue;
      }
      // Split large messages for better rendering performance. Ideally,
      // we should maximize the amount of output sent to <Static />.
      const splitPoint = findLastSafeSplitPoint(newGeminiMessageBuffer);
      if (splitPoint === newGeminiMessageBuffer.length) {
        // Update the existing message with accumulated content
        setPendingHistoryItem((item) => ({
          type: item?.type as 'gemini' | 'gemini_content',
          text: newGeminiMessageBuffer,
        }));
      } else {
        // This indicates that we need to split up this Gemini Message.
        // Splitting a message is primarily a performance consideration. There is a
        // <Static> component at the root of App.tsx which takes care of rendering
        // content statically or dynamically. Everything but the last message is
        // treated as static in order to prevent re-rendering an entire message history
        // multiple times per-second (as streaming occurs). Prior to this change you'd
        // see heavy flickering of the terminal. This ensures that larger messages get
        // broken up so that there are more "statically" rendered.
        const beforeText = newGeminiMessageBuffer.substring(0, splitPoint);
        const afterText = newGeminiMessageBuffer.substring(splitPoint);
        addItem(
          {
            type: pendingHistoryItemRef.current?.type as
              | 'gemini'
              | 'gemini_content',
            text: beforeText,
          },
          userMessageTimestamp,
        );
        setPendingHistoryItem({ type: 'gemini_content', text: afterText });
        newGeminiMessageBuffer = afterText;
      }
      return newGeminiMessageBuffer;
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleUserCancelledEvent = useCallback(
    (userMessageTimestamp: number) => {
      if (pendingHistoryItemRef.current) {
        if (pendingHistoryItemRef.current.type === 'tool_group') {
          const updatedTools = pendingHistoryItemRef.current.tools.map(
            (tool) =>
              tool.status === ToolCallStatus.Pending ||
              tool.status === ToolCallStatus.Confirming ||
              tool.status === ToolCallStatus.Executing
                ? { ...tool, status: ToolCallStatus.Canceled }
                : tool,
          );
          const pendingItem: HistoryItemToolGroup = {
            ...pendingHistoryItemRef.current,
            tools: updatedTools,
          };
          addItem(pendingItem, userMessageTimestamp);
        } else {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.INFO, text: 'User cancelled the request.' },
        userMessageTimestamp,
      );
      setIsResponding(false);
      cancelAllToolCalls();
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, cancelAllToolCalls],
  );

  const handleErrorEvent = useCallback(
    (eventValue: ErrorEvent['value'], userMessageTimestamp: number) => {
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.ERROR, text: `[API Error: ${eventValue.message}]` },
        userMessageTimestamp,
      );
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const processGeminiStreamEvents = useCallback(
    async (
      stream: AsyncIterable<GeminiEvent>,
      userMessageTimestamp: number,
    ): Promise<StreamProcessingStatus> => {
      let geminiMessageBuffer = '';
      const toolCallRequests: ToolCallRequestInfo[] = [];
      for await (const event of stream) {
        if (event.type === ServerGeminiEventType.Content) {
          geminiMessageBuffer = handleContentEvent(
            event.value,
            geminiMessageBuffer,
            userMessageTimestamp,
          );
        } else if (event.type === ServerGeminiEventType.ToolCallRequest) {
          toolCallRequests.push(event.value);
        } else if (event.type === ServerGeminiEventType.UserCancelled) {
          handleUserCancelledEvent(userMessageTimestamp);
          return StreamProcessingStatus.UserCancelled;
        } else if (event.type === ServerGeminiEventType.Error) {
          handleErrorEvent(event.value, userMessageTimestamp);
          return StreamProcessingStatus.Error;
        }
      }
      if (toolCallRequests.length > 0) {
        scheduleToolCalls(toolCallRequests);
      }
      return StreamProcessingStatus.Completed;
    },
    [
      handleContentEvent,
      handleUserCancelledEvent,
      handleErrorEvent,
      scheduleToolCalls,
    ],
  );

  const submitQuery = useCallback(
    async (query: PartListUnion) => {
      if (
        streamingState === StreamingState.Responding ||
        streamingState === StreamingState.WaitingForConfirmation
      )
        return;

      const userMessageTimestamp = Date.now();
      setShowHelp(false);

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;

      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        query,
        userMessageTimestamp,
        abortSignal,
      );

      if (!shouldProceed || queryToSend === null) {
        return;
      }

      const { client, chat } = await ensureChatSession();

      if (!client || !chat) {
        return;
      }

      setIsResponding(true);
      setInitError(null);

      try {
        const stream = client.sendMessageStream(chat, queryToSend, abortSignal);
        const processingStatus = await processGeminiStreamEvents(
          stream,
          userMessageTimestamp,
        );

        if (processingStatus === StreamProcessingStatus.UserCancelled) {
          return;
        }

        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }
      } catch (error: unknown) {
        if (!isNodeError(error) || error.name !== 'AbortError') {
          addItem(
            {
              type: MessageType.ERROR,
              text: `[Stream Error: ${getErrorMessage(error) || 'Unknown error'}]`,
            },
            userMessageTimestamp,
          );
        }
      } finally {
        abortControllerRef.current = null; // Always reset
        setIsResponding(false);
      }
    },
    [
      streamingState,
      setShowHelp,
      prepareQueryForGemini,
      ensureChatSession,
      processGeminiStreamEvents,
      pendingHistoryItemRef,
      addItem,
      setPendingHistoryItem,
      setInitError,
    ],
  );

  /**
   * Automatically submits responses for completed tool calls.
   * This effect runs when `toolCalls` or `isResponding` changes.
   * It ensures that tool responses are sent back to Gemini only when
   * all processing for a given set of tools is finished and Gemini
   * is not already generating a response.
   */
  useEffect(() => {
    if (isResponding) {
      return;
    }

    const completedAndReadyToSubmitTools = toolCalls.filter(
      (
        tc: TrackedToolCall,
      ): tc is TrackedCompletedToolCall | TrackedCancelledToolCall => {
        const isTerminalState =
          tc.status === 'success' ||
          tc.status === 'error' ||
          tc.status === 'cancelled';

        if (isTerminalState) {
          const completedOrCancelledCall = tc as
            | TrackedCompletedToolCall
            | TrackedCancelledToolCall;
          return (
            !completedOrCancelledCall.responseSubmittedToGemini &&
            completedOrCancelledCall.response?.responseParts !== undefined
          );
        }
        return false;
      },
    );

    if (
      completedAndReadyToSubmitTools.length > 0 &&
      completedAndReadyToSubmitTools.length === toolCalls.length
    ) {
      const responsesToSend: PartListUnion[] =
        completedAndReadyToSubmitTools.map(
          (toolCall) => toolCall.response.responseParts,
        );
      const callIdsToMarkAsSubmitted = completedAndReadyToSubmitTools.map(
        (toolCall) => toolCall.request.callId,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);
      submitQuery(mergePartListUnions(responsesToSend));
    }
  }, [toolCalls, isResponding, submitQuery, markToolsAsSubmitted, addItem]);

  const pendingHistoryItems = [
    pendingHistoryItemRef.current,
    pendingToolCallGroupDisplay,
  ].filter((i) => i !== undefined && i !== null);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
  };
};
