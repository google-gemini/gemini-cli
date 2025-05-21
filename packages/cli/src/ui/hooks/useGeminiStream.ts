/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useInput } from 'ink';
import {
  GeminiClient,
  GeminiEventType as ServerGeminiEventType,
  ServerGeminiStreamEvent as GeminiEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiToolCallRequestEvent as ToolCallRequestEvent,
  ServerGeminiToolCallResponseEvent as ToolCallResponseEvent,
  ServerGeminiToolCallConfirmationEvent as ToolCallConfirmationEvent,
  ServerGeminiErrorEvent as ErrorEvent,
  getErrorMessage,
  isNodeError,
  Config,
  MessageSenderType,
  ServerToolCallConfirmationDetails,
  ToolCallConfirmationDetails,
  ToolCallResponseInfo,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolResultDisplay,
  partListUnionToString,
} from '@gemini-code/server';
import { type Chat, type PartListUnion, type Part } from '@google/genai';
import {
  StreamingState,
  IndividualToolCallDisplay,
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
  handleSlashCommand: (cmd: PartListUnion) => boolean,
  shellModeActive: boolean,
) => {
  const toolRegistry = config.getToolRegistry();
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  const geminiClientRef = useRef<GeminiClient | null>(null);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const logger = useLogger();

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
      if (handleSlashCommand(trimmedQuery)) {
        return { queryToSend: null, shouldProceed: false };
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

  const updateConfirmingFunctionStatusUI = (
    callId: string,
    confirmationDetails: ToolCallConfirmationDetails | undefined,
  ) => {
    setPendingHistoryItem((item) =>
      item?.type === 'tool_group'
        ? {
            ...item,
            tools: item.tools.map((tool) =>
              tool.callId === callId
                ? {
                    ...tool,
                    status: ToolCallStatus.Confirming,
                    confirmationDetails,
                  }
                : tool,
            ),
          }
        : item,
    );
  };

  const wireConfirmationSubmission = (
    confirmationDetails: ServerToolCallConfirmationDetails,
  ): ToolCallConfirmationDetails => {
    const originalConfirmationDetails = confirmationDetails.details;
    const request = confirmationDetails.request;
    const resubmittingConfirm = async (outcome: ToolConfirmationOutcome) => {
      originalConfirmationDetails.onConfirm(outcome);
      if (pendingHistoryItemRef?.current?.type === 'tool_group') {
        setPendingHistoryItem((item) =>
          item?.type === 'tool_group'
            ? {
                ...item,
                tools: item.tools.map((tool) =>
                  tool.callId === request.callId
                    ? {
                        ...tool,
                        confirmationDetails: undefined,
                        status: ToolCallStatus.Executing,
                      }
                    : tool,
                ),
              }
            : item,
        );
        refreshStatic();
      }

      if (outcome === ToolConfirmationOutcome.Cancel) {
        declineToolExecution(
          'User rejected function call.',
          ToolCallStatus.Error,
          request,
          originalConfirmationDetails,
        );
      } else {
        const tool = toolRegistry.getTool(request.name);
        if (!tool) {
          throw new Error(
            `Tool "${request.name}" not found or is not registered.`,
          );
        }
        try {
          abortControllerRef.current = new AbortController();
          const result = await tool.execute(
            request.args,
            abortControllerRef.current.signal,
          );
          if (abortControllerRef.current.signal.aborted) {
            declineToolExecution(
              partListUnionToString(result.llmContent),
              ToolCallStatus.Canceled,
              request,
              originalConfirmationDetails,
            );
            return;
          }

          const functionResponse: Part = {
            functionResponse: {
              name: request.name,
              id: request.callId,
              response: { output: result.llmContent },
            },
          };
          const responseInfo: ToolCallResponseInfo = {
            callId: request.callId,
            responsePart: functionResponse,
            resultDisplay: result.returnDisplay,
            error: undefined,
          };
          updateFunctionResponseUI(responseInfo, ToolCallStatus.Success);
          if (pendingHistoryItemRef.current) {
            addItem(pendingHistoryItemRef.current, Date.now());
            setPendingHistoryItem(null);
          }
          setIsResponding(false);
          await submitQuery(functionResponse); // Recursive call
        } finally {
          if (streamingState !== StreamingState.WaitingForConfirmation) {
            abortControllerRef.current = null;
          }
        }
      }
    };

    // Extracted declineToolExecution to be part of wireConfirmationSubmission's closure
    // or could be a standalone helper if more params are passed.
    function declineToolExecution(
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

    return { ...originalConfirmationDetails, onConfirm: resubmittingConfirm };
  };

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

  const handleToolCallRequestEvent = (
    eventValue: ToolCallRequestEvent['value'],
    userMessageTimestamp: number,
  ) => {
    const { callId, name, args } = eventValue;
    const cliTool = toolRegistry.getTool(name);
    if (!cliTool) {
      console.error(`CLI Tool "${name}" not found!`);
      return; // Skip this event if tool is not found
    }
    if (pendingHistoryItemRef.current?.type !== 'tool_group') {
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
      }
      setPendingHistoryItem({ type: 'tool_group', tools: [] });
    }
    let description: string;
    try {
      description = cliTool.getDescription(args);
    } catch (e) {
      description = `Error: Unable to get description: ${getErrorMessage(e)}`;
    }
    const toolCallDisplay: IndividualToolCallDisplay = {
      callId,
      name: cliTool.displayName,
      description,
      status: ToolCallStatus.Pending,
      resultDisplay: undefined,
      confirmationDetails: undefined,
    };
    setPendingHistoryItem((pending) =>
      pending?.type === 'tool_group'
        ? { ...pending, tools: [...pending.tools, toolCallDisplay] }
        : null,
    );
  };

  const handleToolCallResponseEvent = (
    eventValue: ToolCallResponseEvent['value'],
  ) => {
    const status = eventValue.error
      ? ToolCallStatus.Error
      : ToolCallStatus.Success;
    updateFunctionResponseUI(eventValue, status);
  };

  const handleToolCallConfirmationEvent = (
    eventValue: ToolCallConfirmationEvent['value'],
  ) => {
    const confirmationDetails = wireConfirmationSubmission(eventValue);
    updateConfirmingFunctionStatusUI(
      eventValue.request.callId,
      confirmationDetails,
    );
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

    for await (const event of stream) {
      if (event.type === ServerGeminiEventType.Content) {
        geminiMessageBuffer = handleContentEvent(
          event.value,
          geminiMessageBuffer,
          userMessageTimestamp,
        );
      } else if (event.type === ServerGeminiEventType.ToolCallRequest) {
        handleToolCallRequestEvent(event.value, userMessageTimestamp);
      } else if (event.type === ServerGeminiEventType.ToolCallResponse) {
        handleToolCallResponseEvent(event.value);
      } else if (event.type === ServerGeminiEventType.ToolCallConfirmation) {
        handleToolCallConfirmationEvent(event.value);
        return StreamProcessingStatus.PausedForConfirmation;
      } else if (event.type === ServerGeminiEventType.UserCancelled) {
        handleUserCancelledEvent(userMessageTimestamp);
        return StreamProcessingStatus.UserCancelled;
      } else if (event.type === ServerGeminiEventType.Error) {
        handleErrorEvent(event.value, userMessageTimestamp);
        return StreamProcessingStatus.Error;
      }
    }
    return StreamProcessingStatus.Completed;
  };

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

  const streamingState: StreamingState = isResponding
    ? StreamingState.Responding
    : pendingConfirmations(pendingHistoryItemRef.current)
      ? StreamingState.WaitingForConfirmation
      : StreamingState.Idle;

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItem: pendingHistoryItemRef.current,
  };
};

const pendingConfirmations = (item: HistoryItemWithoutId | null): boolean =>
  item?.type === 'tool_group' &&
  item.tools.some((t) => t.status === ToolCallStatus.Confirming);
