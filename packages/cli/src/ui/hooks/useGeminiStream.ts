/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec as _exec } from 'child_process';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useInput } from 'ink';
// Import server-side client and types
import {
  GeminiClient,
  GeminiEventType as ServerGeminiEventType, // Rename to avoid conflict
  getErrorMessage,
  isNodeError,
  ToolResult,
  Config,
} from '@gemini-code/server';
import type { Chat, PartListUnion, FunctionDeclaration } from '@google/genai';
// Import CLI types
import {
  HistoryItem,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { Tool } from '../../tools/tools.js'; // CLI Tool definition
import { StreamingState } from '../../core/gemini-stream.js';
// Import CLI tool registry
import { toolRegistry } from '../../tools/tool-registry.js';

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
        geminiClientRef.current = new GeminiClient(
          config.getApiKey(),
          config.getModel(),
        );
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

  // Improved submit query function
  const submitQuery = useCallback(
    async (query: PartListUnion) => {
      if (streamingState === StreamingState.Responding) return;
      if (typeof query === 'string' && query.trim().length === 0) return;

      if (typeof query === 'string') {
        setDebugMessage(`User query: ${query}`);
        const maybeCommand = query.split(/\s+/)[0];
        if (query.trim() === 'clear') {
          // This just clears the *UI* history, not the model history.
          // TODO: add a slash command for that.
          setDebugMessage('Clearing terminal.');
          setHistory((prevHistory) => []);
          return;
        } else if (config.getPassthroughCommands().includes(maybeCommand)) {
          // Execute and capture output
          setDebugMessage(`Executing shell command directly: ${query}`);
          _exec(query, (error, stdout, stderr) => {
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
          return; // Prevent Gemini call
        }
      }

      const userMessageTimestamp = Date.now();
      const client = geminiClientRef.current;
      if (!client) {
        setInitError('Gemini client is not available.');
        return;
      }

      if (!chatSessionRef.current) {
        try {
          // Use getFunctionDeclarations for startChat
          const toolSchemas = toolRegistry.getFunctionDeclarations();
          chatSessionRef.current = await client.startChat(toolSchemas);
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

        // Get ServerTool descriptions for the server call
        const serverTools: ServerTool[] = toolRegistry
          .getAllTools()
          .map((cliTool: Tool) => ({
            name: cliTool.name,
            schema: cliTool.schema,
            execute: (args: Record<string, unknown>) =>
              cliTool.execute(args as ToolArgs), // Pass execution
          }));

        const stream = client.sendMessageStream(
          chat,
          query,
          serverTools,
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

            // Create the UI display object matching IndividualToolCallDisplay
            const toolCallDisplay: IndividualToolCallDisplay = {
              callId,
              name,
              description: cliTool.getDescription(args as ToolArgs),
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

            // --- Tool Execution & Confirmation Logic ---
            const confirmationDetails = await cliTool.shouldConfirmExecute(
              args as ToolArgs,
            );

            if (confirmationDetails) {
              setHistory((prevHistory) =>
                prevHistory.map((item) => {
                  if (
                    item.id === currentToolGroupId &&
                    item.type === 'tool_group'
                  ) {
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
              setStreamingState(StreamingState.WaitingForConfirmation);
              return;
            }

            try {
              setHistory((prevHistory) =>
                prevHistory.map((item) => {
                  if (
                    item.id === currentToolGroupId &&
                    item.type === 'tool_group'
                  ) {
                    return {
                      ...item,
                      tools: item.tools.map((tool) =>
                        tool.callId === callId
                          ? { ...tool, status: ToolCallStatus.Invoked }
                          : tool,
                      ),
                    };
                  }
                  return item;
                }),
              );

              const result: ToolResult = await cliTool.execute(
                args as ToolArgs,
              );
              const resultPart = {
                functionResponse: {
                  name,
                  id: callId,
                  response: { output: result.llmContent },
                },
              };

              setHistory((prevHistory) =>
                prevHistory.map((item) => {
                  if (
                    item.id === currentToolGroupId &&
                    item.type === 'tool_group'
                  ) {
                    return {
                      ...item,
                      tools: item.tools.map((tool) =>
                        tool.callId === callId
                          ? {
                              ...tool,
                              status: ToolCallStatus.Success,
                              resultDisplay: result.returnDisplay,
                            }
                          : tool,
                      ),
                    };
                  }
                  return item;
                }),
              );

              // Execute the function and continue the stream
              await submitQuery(resultPart);
              return;
            } catch (execError: unknown) {
              const error = new Error(
                `Tool execution failed: ${execError instanceof Error ? execError.message : String(execError)}`,
              );
              const errorPart = {
                functionResponse: {
                  name,
                  id: callId,
                  response: {
                    error: `Tool execution failed: ${error.message}`,
                  },
                },
              };
              setHistory((prevHistory) =>
                prevHistory.map((item) => {
                  if (
                    item.id === currentToolGroupId &&
                    item.type === 'tool_group'
                  ) {
                    return {
                      ...item,
                      tools: item.tools.map((tool) =>
                        tool.callId === callId
                          ? {
                              ...tool,
                              status: ToolCallStatus.Error,
                              resultDisplay: `Error: ${error.message}`,
                            }
                          : tool,
                      ),
                    };
                  }
                  return item;
                }),
              );
              await submitQuery(errorPart);
              return;
            }
          }
        }
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
      } finally {
        abortControllerRef.current = null;
        // Only set to Idle if not waiting for confirmation.
        // Passthrough commands handle their own Idle transition.
        if (streamingState !== StreamingState.WaitingForConfirmation) {
          setStreamingState(StreamingState.Idle);
        }
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

// Define ServerTool interface here if not importing from server (circular dep issue?)
interface ServerTool {
  name: string;
  schema: FunctionDeclaration;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

// Define a more specific type for tool arguments to replace 'any'
type ToolArgs = Record<string, unknown>;
