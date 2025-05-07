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
  HistoryItem,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import { findSafeSplitPoint } from '../utils/markdownUtilities.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

/**
 * Hook to manage the Gemini stream, handle user input, process commands,
 * and interact with the Gemini API and history manager.
 */
export const useGeminiStream = (
  addItem: UseHistoryManagerReturn['addItem'],
  updateItem: UseHistoryManagerReturn['updateItem'],
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
  const currentGeminiMessageIdRef = useRef<number | null>(null);

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

  const updateGeminiMessage = useCallback(
    (messageId: number, newContent: string) => {
      updateItem(messageId, { text: newContent });
    },
    [updateItem],
  );

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
            updateItem,
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
      let currentToolGroupMessageId: number | null = null;

      try {
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const stream = client.sendMessageStream(
          chat,
          queryToSendToGemini,
          signal,
        );

        let currentGeminiText = '';
        let hasInitialGeminiResponse = false;

        for await (const event of stream) {
          if (signal.aborted) break;

          if (event.type === ServerGeminiEventType.Content) {
            currentGeminiText += event.value;
            currentToolGroupMessageId = null; // Reset group on new text content

            if (!hasInitialGeminiResponse) {
              hasInitialGeminiResponse = true;
              const eventId = addItem(
                { type: 'gemini', text: currentGeminiText },
                userMessageTimestamp,
              );
              currentGeminiMessageIdRef.current = eventId;
            } else if (currentGeminiMessageIdRef.current !== null) {
              // Split large messages for better rendering performance
              const splitPoint = findSafeSplitPoint(currentGeminiText);
              if (splitPoint === currentGeminiText.length) {
                updateGeminiMessage(
                  currentGeminiMessageIdRef.current,
                  currentGeminiText,
                );
              } else {
                // This indicates that we need to split up this Gemini Message.
                // Splitting a message is primarily a performance consideration. There is a
                // <Static> component at the root of App.tsx which takes care of rendering
                // content statically or dynamically. Everything but the last message is
                // treated as static in order to prevent re-rendering an entire message history
                // multiple times per-second (as streaming occurs). Prior to this change you'd
                // see heavy flickering of the terminal. This ensures that larger messages get
                // broken up so that there are more "statically" rendered.
                const originalMessageRef = currentGeminiMessageIdRef.current;
                const beforeText = currentGeminiText.substring(0, splitPoint);
                const afterText = currentGeminiText.substring(splitPoint);
                currentGeminiText = afterText; // Continue accumulating from split point
                updateItem(originalMessageRef, { text: beforeText });
                const nextId = addItem(
                  { type: 'gemini_content', text: afterText },
                  userMessageTimestamp,
                );
                currentGeminiMessageIdRef.current = nextId;
              }
            }
          } else if (event.type === ServerGeminiEventType.ToolCallRequest) {
            currentGeminiText = '';
            hasInitialGeminiResponse = false;
            currentGeminiMessageIdRef.current = null;

            const { callId, name, args } = event.value;
            const cliTool = toolRegistry.getTool(name);
            if (!cliTool) {
              console.error(`CLI Tool "${name}" not found!`);
              continue;
            }

            // Create a new tool group if needed
            if (currentToolGroupMessageId === null) {
              currentToolGroupMessageId = addItem(
                { type: 'tool_group', tools: [] } as Omit<HistoryItem, 'id'>,
                userMessageTimestamp,
              );
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

            // Add the pending tool call to the current group
            if (currentToolGroupMessageId !== null) {
              updateItem(
                currentToolGroupMessageId,
                (
                  currentItem: HistoryItem,
                ): Partial<Omit<HistoryItem, 'id'>> => {
                  if (currentItem?.type !== 'tool_group') {
                    console.error(
                      `Attempted to update non-tool-group item ${currentItem?.id} as tool group.`,
                    );
                    return currentItem as Partial<Omit<HistoryItem, 'id'>>;
                  }
                  const currentTools = currentItem.tools;
                  return {
                    ...currentItem,
                    tools: [...currentTools, toolCallDisplay],
                  } as Partial<Omit<HistoryItem, 'id'>>;
                },
              );
            }
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
        if (currentToolGroupMessageId === null) return;
        updateItem(
          currentToolGroupMessageId,
          (currentItem: HistoryItem): Partial<Omit<HistoryItem, 'id'>> => {
            if (currentItem?.type !== 'tool_group') {
              console.error(
                `Attempted to update non-tool-group item ${currentItem?.id} status.`,
              );
              return currentItem as Partial<Omit<HistoryItem, 'id'>>;
            }
            return {
              ...currentItem,
              tools: (currentItem.tools || []).map((tool) =>
                tool.callId === callId
                  ? {
                      ...tool,
                      status: ToolCallStatus.Confirming,
                      confirmationDetails,
                    }
                  : tool,
              ),
            } as Partial<Omit<HistoryItem, 'id'>>;
          },
        );
      }

      function updateFunctionResponseUI(
        toolResponse: ToolCallResponseInfo,
        status: ToolCallStatus,
      ) {
        if (currentToolGroupMessageId === null) return;
        updateItem(
          currentToolGroupMessageId,
          (currentItem: HistoryItem): Partial<Omit<HistoryItem, 'id'>> => {
            if (currentItem?.type !== 'tool_group') {
              console.error(
                `Attempted to update non-tool-group item ${currentItem?.id} response.`,
              );
              return currentItem as Partial<Omit<HistoryItem, 'id'>>;
            }
            return {
              ...currentItem,
              tools: (currentItem.tools || []).map((tool) => {
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
            } as Partial<Omit<HistoryItem, 'id'>>;
          },
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
          if (currentToolGroupMessageId !== null) {
            updateItem(
              currentToolGroupMessageId,
              (currentItem: HistoryItem) => {
                if (currentItem?.type !== 'tool_group')
                  return currentItem as Partial<Omit<HistoryItem, 'id'>>;
                return {
                  ...currentItem,
                  tools: (currentItem.tools || []).map((tool) =>
                    tool.callId === request.callId
                      ? {
                          ...tool,
                          confirmationDetails: undefined,
                          status: ToolCallStatus.Executing,
                        }
                      : tool,
                  ),
                } as Partial<Omit<HistoryItem, 'id'>>;
              },
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
      config,
      updateGeminiMessage,
      handleSlashCommand,
      handleShellCommand,
      setDebugMessage,
      setStreamingState,
      addItem,
      updateItem,
      setShowHelp,
      toolRegistry,
      setInitError,
      refreshStatic,
    ],
  );

  return {
    streamingState,
    submitQuery,
    initError,
    debugMessage,
    slashCommands,
  };
};
