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
  ServerToolCallConfirmationDetails,
  ToolCallResponseInfo,
  ToolEditConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolResultDisplay,
  ToolCallRequestInfo,
} from '@gemini-code/server';
import { type Chat, type PartListUnion, type Part } from '@google/genai';
import {
  StreamingState,
  ToolCallStatus,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  MessageType,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { useStateAndRef } from './useStateAndRef.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import { useToolScheduler, mapToDisplay } from './useToolScheduler.js';

enum StreamProcessingStatus {
  Completed,
  PausedForConfirmation,
  UserCancelled,
  Error,
}

/**
 * Hook to manage the Gemini stream, handle user input, process commands,
 * and interact with the Gemini API and history manager.
 */
export const useGeminiStream = (
  addItem: UseHistoryManagerReturn['addItem'],
  refreshStatic: () => void,
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
  const chatSessionRef = useRef<Chat | null>(null);
  const geminiClientRef = useRef<GeminiClient | null>(null);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const logger = useLogger();
  const [toolCalls, schedule, cancel] = useToolScheduler((tools) => {
    if (tools.length) {
      addItem(mapToDisplay(tools), Date.now());
      submitQuery(
        tools
          .filter(
            (t) =>
              t.status === 'error' ||
              t.status === 'cancelled' ||
              t.status === 'success',
          )
          .map((t) => t.response.responsePart),
      );
    }
  }, config);
  const pendingToolCalls = useMemo(
    () => (toolCalls.length ? mapToDisplay(toolCalls) : undefined),
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
      cancel();
    }
  });

  const prepareQueryForGemini = async (
    query: PartListUnion,
    userMessageTimestamp: number,
    signal: AbortSignal,
  ): Promise<{ queryToSend: PartListUnion | null; shouldProceed: boolean }> => {
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
          schedule([toolCallRequest]); // schedule expects an array or single object
        }
        return { queryToSend: null, shouldProceed: false }; // Handled by scheduling the tool
      }

      if (shellModeActive && handleShellCommand(trimmedQuery)) {
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
          signal,
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
  };

  const ensureChatSession = async (): Promise<{
    client: GeminiClient | null;
    chat: Chat | null;
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
  };

  // --- UI Helper Functions (used by event handlers) ---
  const updateFunctionResponseUI = (
    toolResponse: ToolCallResponseInfo,
    status: ToolCallStatus,
  ) => {
    setPendingHistoryItem((item) =>
      item?.type === 'tool_group'
        ? {
            ...item,
            tools: item.tools.map((tool) =>
              tool.callId === toolResponse.callId
                ? {
                    ...tool,
                    status,
                    resultDisplay: toolResponse.resultDisplay,
                  }
                : tool,
            ),
          }
        : item,
    );
  };

  // Extracted declineToolExecution to be part of wireConfirmationSubmission's closure
  // or could be a standalone helper if more params are passed.
  // TODO: handle file diff result display stuff
  function _declineToolExecution(
    declineMessage: string,
    status: ToolCallStatus,
    request: ServerToolCallConfirmationDetails['request'],
    originalDetails: ServerToolCallConfirmationDetails['details'],
  ) {
    let resultDisplay: ToolResultDisplay | undefined;
    if ('fileDiff' in originalDetails) {
      resultDisplay = {
        fileDiff: (originalDetails as ToolEditConfirmationDetails).fileDiff,
        fileName: (originalDetails as ToolEditConfirmationDetails).fileName,
      };
    } else {
      resultDisplay = `~~${(originalDetails as ToolExecuteConfirmationDetails).command}~~`;
    }
    const functionResponse: Part = {
      functionResponse: {
        id: request.callId,
        name: request.name,
        response: { error: declineMessage },
      },
    };
    const responseInfo: ToolCallResponseInfo = {
      callId: request.callId,
      responsePart: functionResponse,
      resultDisplay,
      error: new Error(declineMessage),
    };
    const history = chatSessionRef.current?.getHistory();
    if (history) {
      history.push({ role: 'model', parts: [functionResponse] });
    }
    updateFunctionResponseUI(responseInfo, status);
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, Date.now());
      setPendingHistoryItem(null);
    }
    setIsResponding(false);
  }

  // --- Stream Event Handlers ---
  const handleContentEvent = (
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
  };

  const handleUserCancelledEvent = (userMessageTimestamp: number) => {
    if (pendingHistoryItemRef.current) {
      if (pendingHistoryItemRef.current.type === 'tool_group') {
        const updatedTools = pendingHistoryItemRef.current.tools.map((tool) =>
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
    cancel();
  };

  const handleErrorEvent = (
    eventValue: ErrorEvent['value'],
    userMessageTimestamp: number,
  ) => {
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, userMessageTimestamp);
      setPendingHistoryItem(null);
    }
    addItem(
      { type: MessageType.ERROR, text: `[API Error: ${eventValue.message}]` },
      userMessageTimestamp,
    );
  };

  const processGeminiStreamEvents = async (
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
        cancel();
        return StreamProcessingStatus.UserCancelled;
      } else if (event.type === ServerGeminiEventType.Error) {
        handleErrorEvent(event.value, userMessageTimestamp);
        return StreamProcessingStatus.Error;
      }
    }
    schedule(toolCallRequests);
    return StreamProcessingStatus.Completed;
  };

  const streamingState: StreamingState =
    isResponding ||
    toolCalls.some(
      (t) => t.status === 'awaiting_approval' || t.status === 'executing',
    )
      ? StreamingState.Responding
      : StreamingState.Idle;

  const submitQuery = useCallback(
    async (query: PartListUnion) => {
      if (isResponding) return;

      const userMessageTimestamp = Date.now();
      setShowHelp(false);

      abortControllerRef.current ??= new AbortController();
      const signal = abortControllerRef.current.signal;

      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        query,
        userMessageTimestamp,
        signal,
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
        const stream = client.sendMessageStream(chat, queryToSend, signal);
        const processingStatus = await processGeminiStreamEvents(
          stream,
          userMessageTimestamp,
        );

        if (
          processingStatus === StreamProcessingStatus.PausedForConfirmation ||
          processingStatus === StreamProcessingStatus.UserCancelled
        ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isResponding,
      setShowHelp,
      handleSlashCommand,
      shellModeActive,
      handleShellCommand,
      config,
      addItem,
      onDebugMessage,
      refreshStatic,
      setInitError,
      logger,
    ],
  );

  const pendingHistoryItems = [
    pendingHistoryItemRef.current,
    pendingToolCalls,
  ].filter((i) => i !== undefined && i !== null);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
  };
};
