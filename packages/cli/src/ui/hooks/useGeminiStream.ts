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
  getErrorMessage,
  isNodeError,
  Config,
  ToolCallConfirmationDetails,
  ToolCallResponseInfo,
  ServerToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolResultDisplay,
  ToolEditConfirmationDetails,
  ToolExecuteConfirmationDetails,
} from '@gemini-code/server';
import { type Chat, type PartListUnion, type Part } from '@google/genai';
import {
  StreamingState,
  IndividualToolCallDisplay,
  ToolCallStatus,
  HistoryItemWithoutId,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import { findSafeSplitPoint } from '../utils/markdownUtilities.js';
import { useStateAndRef } from './useStateAndRef.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

/**
 * Hook to manage the Gemini stream, handle user input, process commands,
 * and interact with the Gemini API and history manager.
 */
export const useGeminiStream = (
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  config: Config,
  openThemeDialog: () => void,
) => {
  const toolRegistry = config.getToolRegistry();
  const [streamingState, setStreamingState] = useState<StreamingState>(
    StreamingState.Idle,
  );
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  const geminiClientRef = useRef<GeminiClient | null>(null);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);

  const { handleSlashCommand, slashCommands } = useSlashCommandProcessor(
    addItem,
    clearItems,
    refreshStatic,
    setShowHelp,
    setDebugMessage,
    openThemeDialog,
  );

  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setStreamingState,
    setDebugMessage,
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
        addItem({ type: 'error', text: errorMsg }, Date.now());
      }
    }
  }, [config, addItem]);

  useInput((_input, key) => {
    if (streamingState === StreamingState.Responding && key.escape) {
      abortControllerRef.current?.abort();
    }
  });

  const submitQuery = useCallback(
    async (query: PartListUnion) => {
      if (streamingState === StreamingState.Responding) return;
      if (typeof query === 'string' && query.trim().length === 0) return;

      const userMessageTimestamp = Date.now();
      let queryToSendToGemini: PartListUnion | null = null;

      setShowHelp(false);

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        setDebugMessage(`User query: '${trimmedQuery}'`);

        // Handle UI-only commands first
        if (handleSlashCommand(trimmedQuery)) return;
        if (handleShellCommand(trimmedQuery)) return;

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleAtCommand({
            query: trimmedQuery,
            config,
            addItem,
            setDebugMessage,
            messageId: userMessageTimestamp,
          });
          if (!atCommandResult.shouldProceed) return;
          queryToSendToGemini = atCommandResult.processedQuery;
        } else {
          // Normal query for Gemini
          addItem({ type: 'user', text: trimmedQuery }, userMessageTimestamp);
          queryToSendToGemini = trimmedQuery;
        }
      } else {
        // It's a function response (PartListUnion that isn't a string)
        queryToSendToGemini = query;
      }

      if (queryToSendToGemini === null) {
        setDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return;
      }

      const client = geminiClientRef.current;
      if (!client) {
        const errorMsg = 'Gemini client is not available.';
        setInitError(errorMsg);
        addItem({ type: 'error', text: errorMsg }, Date.now());
        return;
      }

      if (!chatSessionRef.current) {
        try {
          chatSessionRef.current = await client.startChat();
        } catch (err: unknown) {
          const errorMsg = `Failed to start chat: ${getErrorMessage(err)}`;
          setInitError(errorMsg);
          addItem({ type: 'error', text: errorMsg }, Date.now());
          setStreamingState(StreamingState.Idle);
          return;
        }
      }

      setStreamingState(StreamingState.Responding);
      setInitError(null);
      const chat = chatSessionRef.current;

      try {
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const stream = client.sendMessageStream(
          chat,
          queryToSendToGemini,
          signal,
        );

        let currentGeminiText = '';

        for await (const event of stream) {
          if (signal.aborted) break;

          if (event.type === ServerGeminiEventType.Content) {
            currentGeminiText += event.value;

            if (pendingHistoryItemRef.current?.type !== 'gemini') {
              // Flush out existing pending history item.
              if (pendingHistoryItemRef.current) {
                addItem(pendingHistoryItemRef.current, userMessageTimestamp);
              }
              setPendingHistoryItem({
                type: 'gemini',
                text: currentGeminiText,
              });
            }

            // Split large messages for better rendering performance
            const splitPoint = findSafeSplitPoint(currentGeminiText);
            if (splitPoint === currentGeminiText.length) {
              // Update the existing message with accumulated content
              setPendingHistoryItem((pending) => ({
                // There might be a more typesafe way to do this.
                ...pending!,
                text: currentGeminiText,
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
              const beforeText = currentGeminiText.substring(0, splitPoint);
              const afterText = currentGeminiText.substring(splitPoint);
              currentGeminiText = afterText; // Continue accumulating from split point
              addItem(
                { type: 'gemini_content', text: beforeText },
                userMessageTimestamp,
              );
              setPendingHistoryItem({
                type: 'gemini_content',
                text: afterText,
              });
            }
          } else if (event.type === ServerGeminiEventType.ToolCallRequest) {
            currentGeminiText = '';

            const { callId, name, args } = event.value;
            const cliTool = toolRegistry.getTool(name);
            if (!cliTool) {
              console.error(`CLI Tool "${name}" not found!`);
              continue;
            }

            if (pendingHistoryItemRef.current?.type !== 'tool_group') {
              // Flush out existing pending history item.
              if (pendingHistoryItemRef.current) {
                addItem(pendingHistoryItemRef.current, userMessageTimestamp);
              }
              setPendingHistoryItem({
                type: 'tool_group',
                tools: [],
              });
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

            // Add pending tool call to the UI history group
            setPendingHistoryItem((pending) =>
              // Should always be true.
              pending?.type === 'tool_group'
                ? {
                    ...pending,
                    tools: [...pending.tools, toolCallDisplay],
                  }
                : null,
            );
          } else if (event.type === ServerGeminiEventType.ToolCallResponse) {
            const status = event.value.error
              ? ToolCallStatus.Error
              : ToolCallStatus.Success;
            updateFunctionResponseUI(event.value, status);
          } else if (
            event.type === ServerGeminiEventType.ToolCallConfirmation
          ) {
            const confirmationDetails = wireConfirmationSubmission(event.value);
            updateConfirmingFunctionStatusUI(
              event.value.request.callId,
              confirmationDetails,
            );
            setStreamingState(StreamingState.WaitingForConfirmation);
            return; // Wait for user confirmation
          }
        } // End stream loop

        // We're waiting for user input now so all pending history can be committed.
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }

        setStreamingState(StreamingState.Idle);
      } catch (error: unknown) {
        if (!isNodeError(error) || error.name !== 'AbortError') {
          console.error('Error processing stream or executing tool:', error);
          addItem(
            {
              type: 'error',
              text: `[Stream Error: ${getErrorMessage(error)}]`,
            },
            userMessageTimestamp,
          );
        }
        setStreamingState(StreamingState.Idle);
      } finally {
        abortControllerRef.current = null;
      }

      // --- Helper functions for updating tool UI ---

      function updateConfirmingFunctionStatusUI(
        callId: string,
        confirmationDetails: ToolCallConfirmationDetails | undefined,
      ) {
        if (pendingHistoryItemRef.current?.type !== 'tool_group') return;
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
            : null,
        );
      }

      function updateFunctionResponseUI(
        toolResponse: ToolCallResponseInfo,
        status: ToolCallStatus,
      ) {
        setPendingHistoryItem((item) =>
          item?.type === 'tool_group'
            ? {
                ...item,
                tools: item.tools.map((tool) => {
                  if (tool.callId === toolResponse.callId) {
                    return {
                      ...tool,
                      status,
                      resultDisplay: toolResponse.resultDisplay,
                    };
                  } else {
                    return tool;
                  }
                }),
              }
            : null,
        );
      }

      // Wires the server-side confirmation callback to UI updates and state changes
      function wireConfirmationSubmission(
        confirmationDetails: ServerToolCallConfirmationDetails,
      ): ToolCallConfirmationDetails {
        const originalConfirmationDetails = confirmationDetails.details;
        const request = confirmationDetails.request;
        const resubmittingConfirm = async (
          outcome: ToolConfirmationOutcome,
        ) => {
          // Call the original server-side handler first
          originalConfirmationDetails.onConfirm(outcome);

          // Ensure UI updates before potentially long-running operations
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

          await new Promise((resolve) => setTimeout(resolve, 0)); // Allow UI to re-render

          if (outcome === ToolConfirmationOutcome.Cancel) {
            let resultDisplay: ToolResultDisplay | undefined;
            if ('fileDiff' in originalConfirmationDetails) {
              resultDisplay = {
                fileDiff: (
                  originalConfirmationDetails as ToolEditConfirmationDetails
                ).fileDiff,
              };
            } else {
              resultDisplay = `~~${(originalConfirmationDetails as ToolExecuteConfirmationDetails).command}~~`;
            }
            const functionResponse: Part = {
              functionResponse: {
                id: request.callId,
                name: request.name,
                response: { error: 'User rejected function call.' },
              },
            };
            const responseInfo: ToolCallResponseInfo = {
              callId: request.callId,
              responsePart: functionResponse,
              resultDisplay,
              error: new Error('User rejected function call.'),
            };
            // Update UI to show cancellation/error
            updateFunctionResponseUI(responseInfo, ToolCallStatus.Error);
            setStreamingState(StreamingState.Idle);
          } else {
            const tool = toolRegistry.getTool(request.name);
            if (!tool) {
              throw new Error(
                `Tool "${request.name}" not found or is not registered.`,
              );
            }
            const result = await tool.execute(request.args);
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
            setStreamingState(StreamingState.Idle);
            await submitQuery(functionResponse);
          }
        };

        return {
          ...originalConfirmationDetails,
          onConfirm: resubmittingConfirm,
        };
      }
    },
    [
      streamingState,
      setShowHelp,
      handleSlashCommand,
      handleShellCommand,
      config,
      addItem,
      pendingHistoryItemRef,
      setPendingHistoryItem,
      toolRegistry,
      refreshStatic,
    ],
  );

  return {
    streamingState,
    submitQuery,
    initError,
    debugMessage,
    slashCommands,
    // Normally we would be concerned that the ref would not be up-to-date, but
    // this isn't a concern as the ref is updated whenever the corresponding
    // state is updated.
    pendingHistoryItem: pendingHistoryItemRef.current,
  };
};
