/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useInput } from 'ink';
import {
  GeminiClient,
  GeminiEventType as ServerGeminiEventType, // Rename to avoid conflict
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

const addHistoryItem = (
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
  itemData: Omit<HistoryItem, 'id'>,
  id: number,
) => {
  setHistory((prevHistory) => [
    ...prevHistory,
    { ...itemData, id } as HistoryItem,
  ]);
};

// Hook now accepts apiKey and model
export const useGeminiStream = (
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
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
  const messageIdCounterRef = useRef(0);
  const currentGeminiMessageIdRef = useRef<number | null>(null);

  // ID Generation Callback
  const getNextMessageId = useCallback((baseTimestamp: number): number => {
    // Increment *before* adding to ensure uniqueness against the base timestamp
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

  // Instantiate command processors
  const { handleSlashCommand, slashCommands } = useSlashCommandProcessor(
    setHistory,
    refreshStatic,
    setShowHelp,
    setDebugMessage,
    getNextMessageId,
    openThemeDialog,
  );

  const { handleShellCommand } = useShellCommandProcessor(
    setHistory,
    setStreamingState,
    setDebugMessage,
    getNextMessageId,
    config,
  );

  // Initialize Client Effect - uses props now
  useEffect(() => {
    setInitError(null);
    if (!geminiClientRef.current) {
      try {
        geminiClientRef.current = new GeminiClient(config);
      } catch (error: unknown) {
        setInitError(
          `Failed to initialize client: ${getErrorMessage(error) || 'Unknown error'}`,
        );
      }
    }
  }, [config.getApiKey(), config.getModel()]);

  // Input Handling Effect (remains the same)
  useInput((input, key) => {
    if (streamingState === StreamingState.Responding && key.escape) {
      abortControllerRef.current?.abort();
    }
  });

  // Helper function to update Gemini message content
  const updateGeminiMessage = useCallback(
    (messageId: number, newContent: string) => {
      setHistory((prevHistory) =>
        prevHistory.map((item) =>
          item.id === messageId && item.type === 'gemini'
            ? { ...item, text: newContent }
            : item,
        ),
      );
    },
    [setHistory],
  );

  // Helper function to update Gemini message content
  const updateAndAddGeminiMessageContent = useCallback(
    (
      messageId: number,
      previousContent: string,
      nextId: number,
      nextContent: string,
    ) => {
      setHistory((prevHistory) => {
        const beforeNextHistory = prevHistory.map((item) =>
          item.id === messageId ? { ...item, text: previousContent } : item,
        );

        return [
          ...beforeNextHistory,
          { id: nextId, type: 'gemini_content', text: nextContent },
        ];
      });
    },
    [setHistory],
  );

  // Improved submit query function
  const submitQuery = useCallback(
    async (query: PartListUnion) => {
      if (streamingState === StreamingState.Responding) return;
      if (typeof query === 'string' && query.trim().length === 0) return;

      const userMessageTimestamp = Date.now();
      messageIdCounterRef.current = 0; // Reset counter for this new submission
      let queryToSendToGemini: PartListUnion | null = null;

      setShowHelp(false);

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        setDebugMessage(`User query: '${trimmedQuery}'`);

        // 1. Check for Slash Commands (/)
        if (handleSlashCommand(trimmedQuery)) {
          return;
        }

        // 2. Check for Shell Commands (! or $)
        if (handleShellCommand(trimmedQuery)) {
          return;
        }

        // 3. Check for @ Commands using the utility function
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleAtCommand({
            query: trimmedQuery,
            config,
            setHistory,
            setDebugMessage,
            getNextMessageId,
            userMessageTimestamp,
          });

          if (!atCommandResult.shouldProceed) {
            return; // @ command handled it (e.g., error) or decided not to proceed
          }
          queryToSendToGemini = atCommandResult.processedQuery;
          // User message and tool UI were added by handleAtCommand
        } else {
          // 4. It's a normal query for Gemini
          addHistoryItem(
            setHistory,
            { type: 'user', text: trimmedQuery },
            userMessageTimestamp,
          );
          queryToSendToGemini = trimmedQuery;
        }
      } else {
        // 5. It's a function response (PartListUnion that isn't a string)
        // Tool call/response UI handles history. Always proceed.
        queryToSendToGemini = query;
      }

      // --- Proceed to Gemini API call ---
      if (queryToSendToGemini === null) {
        // Should only happen if @ command failed and returned null query
        setDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return;
      }

      const client = geminiClientRef.current;
      if (!client) {
        setInitError('Gemini client is not available.');
        return;
      }

      if (!chatSessionRef.current) {
        try {
          chatSessionRef.current = await client.startChat();
        } catch (err: unknown) {
          setInitError(`Failed to start chat: ${getErrorMessage(err)}`);
          setStreamingState(StreamingState.Idle);
          return;
        }
      }

      setStreamingState(StreamingState.Responding);
      setInitError(null);
      const chat = chatSessionRef.current;
      let currentToolGroupId: number | null = null;

      try {
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Use the determined query for the Gemini call
        const stream = client.sendMessageStream(
          chat,
          queryToSendToGemini,
          signal,
        );

        // Process the stream events from the server logic
        let currentGeminiText = ''; // To accumulate message content
        let hasInitialGeminiResponse = false;

        for await (const event of stream) {
          if (signal.aborted) break;

          if (event.type === ServerGeminiEventType.Content) {
            // For content events, accumulate the text and update an existing message or create a new one
            currentGeminiText += event.value;

            // Reset group because we're now adding a user message to the history. If we didn't reset the
            // group here then any subsequent tool calls would get grouped before this message resulting in
            // a misordering of history.
            currentToolGroupId = null;

            if (!hasInitialGeminiResponse) {
              // Create a new Gemini message if this is the first content event
              hasInitialGeminiResponse = true;
              const eventTimestamp = getNextMessageId(userMessageTimestamp);
              currentGeminiMessageIdRef.current = eventTimestamp;

              addHistoryItem(
                setHistory,
                { type: 'gemini', text: currentGeminiText },
                eventTimestamp,
              );
            } else if (currentGeminiMessageIdRef.current !== null) {
              const splitPoint = findSafeSplitPoint(currentGeminiText);

              if (splitPoint === currentGeminiText.length) {
                // Update the existing message with accumulated content
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

                currentGeminiMessageIdRef.current =
                  getNextMessageId(userMessageTimestamp);
                const afterText = currentGeminiText.substring(splitPoint);
                currentGeminiText = afterText;
                updateAndAddGeminiMessageContent(
                  originalMessageRef,
                  beforeText,
                  currentGeminiMessageIdRef.current,
                  afterText,
                );
              }
            }
          } else if (event.type === ServerGeminiEventType.ToolCallRequest) {
            // Reset the Gemini message tracking for the next response
            currentGeminiText = '';
            hasInitialGeminiResponse = false;
            currentGeminiMessageIdRef.current = null;

            const { callId, name, args } = event.value;

            const cliTool = toolRegistry.getTool(name); // Get the full CLI tool
            if (!cliTool) {
              console.error(`CLI Tool "${name}" not found!`);
              continue;
            }

            if (currentToolGroupId === null) {
              currentToolGroupId = getNextMessageId(userMessageTimestamp);
              // Add explicit cast to Omit<HistoryItem, 'id'>
              addHistoryItem(
                setHistory,
                { type: 'tool_group', tools: [] } as Omit<HistoryItem, 'id'>,
                currentToolGroupId,
              );
            }

            let description: string;
            try {
              description = cliTool.getDescription(args);
            } catch (e) {
              description = `Error: Unable to get description: ${getErrorMessage(e)}`;
            }

            // Create the UI display object matching IndividualToolCallDisplay
            const toolCallDisplay: IndividualToolCallDisplay = {
              callId,
              name: cliTool.displayName,
              description,
              status: ToolCallStatus.Pending,
              resultDisplay: undefined,
              confirmationDetails: undefined,
            };

            // Add pending tool call to the UI history group
            setHistory((prevHistory) =>
              prevHistory.map((item) => {
                if (
                  item.id === currentToolGroupId &&
                  item.type === 'tool_group'
                ) {
                  // Ensure item.tools exists and is an array before spreading
                  const currentTools = Array.isArray(item.tools)
                    ? item.tools
                    : [];
                  return {
                    ...item,
                    tools: [...currentTools, toolCallDisplay], // Add the complete display object
                  };
                }
                return item;
              }),
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
            return;
          }
        }

        setStreamingState(StreamingState.Idle);
      } catch (error: unknown) {
        if (!isNodeError(error) || error.name !== 'AbortError') {
          console.error('Error processing stream or executing tool:', error);
          addHistoryItem(
            setHistory,
            {
              type: 'error',
              text: `[Error: ${getErrorMessage(error)}]`,
            },
            getNextMessageId(userMessageTimestamp),
          );
        }
        setStreamingState(StreamingState.Idle);
      } finally {
        abortControllerRef.current = null;
      }

      function updateConfirmingFunctionStatusUI(
        callId: string,
        confirmationDetails: ToolCallConfirmationDetails | undefined,
      ) {
        setHistory((prevHistory) =>
          prevHistory.map((item) => {
            if (item.id === currentToolGroupId && item.type === 'tool_group') {
              return {
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
              };
            }
            return item;
          }),
        );
      }

      function updateFunctionResponseUI(
        toolResponse: ToolCallResponseInfo,
        status: ToolCallStatus,
      ) {
        setHistory((prevHistory) =>
          prevHistory.map((item) => {
            if (item.id === currentToolGroupId && item.type === 'tool_group') {
              return {
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
              };
            }
            return item;
          }),
        );
      }

      function wireConfirmationSubmission(
        confirmationDetails: ServerToolCallConfirmationDetails,
      ): ToolCallConfirmationDetails {
        const originalConfirmationDetails = confirmationDetails.details;
        const request = confirmationDetails.request;
        const resubmittingConfirm = async (
          outcome: ToolConfirmationOutcome,
        ) => {
          originalConfirmationDetails.onConfirm(outcome);

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
              error: undefined,
            };

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
    // Dependencies need careful review
    [
      streamingState,
      setHistory,
      config,
      getNextMessageId,
      updateGeminiMessage,
      handleSlashCommand,
      // handleAtCommand is implicitly included via its direct call
      setDebugMessage, // Added dependency for handleAtCommand & passthrough
      setStreamingState, // Added dependency for handlePassthroughCommand
      updateAndAddGeminiMessageContent,
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
