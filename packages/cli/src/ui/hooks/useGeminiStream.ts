/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec as _exec } from 'child_process';
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
  config: Config,
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

  // ID Generation Callback (remains the same)
  const getNextMessageId = useCallback((baseTimestamp: number): number => {
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

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

  // Possibly handle a query manually, return true if handled.
  const handleQueryManually = (rawQuery: PartListUnion): boolean => {
    if (typeof rawQuery !== 'string') {
      return false;
    }

    const query = rawQuery.trim();
    if (query === 'clear' || query === '/clear') {
      // This just clears the *UI* history, not the model history.
      // TODO: add a slash command for that.
      setDebugMessage('Clearing terminal.');
      setHistory((_) => []);
      return true;
    }
    if (
      query === 'exit' ||
      query === '/exit' ||
      query === 'quit' ||
      query === '/quit'
    ) {
      setDebugMessage('Quitting. Good-bye.');
      const timestamp = getNextMessageId(Date.now());
      addHistoryItem(
        setHistory,
        { type: 'info', text: 'good-bye!' },
        timestamp,
      );
      process.exit(0);
      return true;
    }
    const maybeCommand = query.split(/\s+/)[0];
    if (config.getPassthroughCommands().includes(maybeCommand)) {
      // Execute and capture output
      const targetDir = config.getTargetDir();
      setDebugMessage(`Executing shell command in ${targetDir}: ${query}`);
      const execOptions = {
        cwd: targetDir,
      };
      _exec(query, execOptions, (error, stdout, stderr) => {
        const timestamp = getNextMessageId(Date.now());
        if (error) {
          addHistoryItem(
            setHistory,
            { type: 'error', text: error.message },
            timestamp,
          );
        } else if (stderr) {
          addHistoryItem(
            setHistory,
            { type: 'error', text: stderr },
            timestamp,
          );
        } else {
          // Add stdout as an info message
          addHistoryItem(
            setHistory,
            { type: 'info', text: stdout || '' },
            timestamp,
          );
        }
        // Set state back to Idle *after* command finishes and output is added
        setStreamingState(StreamingState.Idle);
      });
      // Set state to Responding while the command runs
      setStreamingState(StreamingState.Responding);
      return true;
    }

    return false; // Not handled by a manual command.
  };

  // Improved submit query function
  const submitQuery = useCallback(
    async (query: PartListUnion) => {
      if (streamingState === StreamingState.Responding) return;
      if (typeof query === 'string' && query.trim().length === 0) return;

      if (typeof query === 'string') {
        setDebugMessage(`User query: '${query}'`);
      }

      if (handleQueryManually(query)) {
        return;
      }

      const userMessageTimestamp = Date.now();
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
      messageIdCounterRef.current = 0; // Reset counter for new submission
      const chat = chatSessionRef.current;
      let currentToolGroupId: number | null = null;

      // For function responses, we don't need to add a user message
      if (typeof query === 'string') {
        // Only add user message for string queries, not for function responses
        addHistoryItem(
          setHistory,
          { type: 'user', text: query },
          userMessageTimestamp,
        );
      }

      try {
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const stream = client.sendMessageStream(chat, query, signal);

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
              // Update the existing message with accumulated content
              updateGeminiMessage(
                currentGeminiMessageIdRef.current,
                currentGeminiText,
              );
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

          // Reset streaming state since confirmation has been chosen.
          setStreamingState(StreamingState.Idle);

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

            await submitQuery(functionResponse);
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

            await submitQuery(functionResponse);
          }
        };

        return {
          ...originalConfirmationDetails,
          onConfirm: resubmittingConfirm,
        };
      }
    },
    // Dependencies need careful review - including updateGeminiMessage
    [
      streamingState,
      setHistory,
      config.getApiKey(),
      config.getModel(),
      getNextMessageId,
      updateGeminiMessage,
    ],
  );

  return { streamingState, submitQuery, initError, debugMessage };
};
