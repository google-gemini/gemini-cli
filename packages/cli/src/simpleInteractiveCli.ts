/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolCallRequestInfo,
  ResumedSessionData,
  CompletedToolCall,
  UserFeedbackPayload,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';
import type { InitializationResult } from './core/initializer.js';
import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  promptIdContext,
  debugLogger,
  coreEvents,
  CoreEvent,
  writeToStdout,
  writeToStderr,
} from '@google/gemini-cli-core';

import type { Content, Part } from '@google/genai';
import readline from 'node:readline';

import { convertSessionToHistoryFormats } from './ui/hooks/useSessionBrowser.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import {
  handleError,
  handleToolError,
  handleCancellationError,
  handleMaxTurnsExceededError,
} from './utils/errors.js';
import { TextOutput } from './ui/utils/textOutput.js';
import { isSlashCommand } from './ui/utils/commandUtils.js';
import { handleSlashCommand } from './nonInteractiveCliCommands.js';

interface StartSimpleInteractiveParams {
  config: Config;
  settings: LoadedSettings;
  workspaceRoot?: string;
  resumedSessionData: ResumedSessionData | undefined;
  initializationResult?: InitializationResult;
}

/**
 * Starts a simple interactive mode for non-TTY environments.
 * This mode uses line-based input/output instead of the full Ink terminal UI.
 * Designed for programmatic usage from Java/Node.js/backend services.
 */
export async function startSimpleInteractive({
  config,
  settings,
  workspaceRoot: _workspaceRoot,
  resumedSessionData,
  initializationResult: _initializationResult,
}: StartSimpleInteractiveParams): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
    onNewMessage: (msg) => {
      coreEvents.emitConsoleLog(msg.type, msg.content);
    },
  });

  const textOutput = new TextOutput();
  const abortController = new AbortController();

  // Setup readline for line-based input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false, // Important: we're not in a terminal
    prompt: '', // No prompt needed
  });

  const handleUserFeedback = (payload: UserFeedbackPayload) => {
    const prefix = payload.severity.toUpperCase();
    writeToStderr(`[${prefix}] ${payload.message}\n`);
    if (payload.error && config.getDebugMode()) {
      const errorToLog =
        payload.error instanceof Error
          ? payload.error.stack || payload.error.message
          : String(payload.error);
      writeToStderr(`${errorToLog}\n`);
    }
  };

  let errorToHandle: unknown | undefined;
  let isProcessing = false;

  try {
    consolePatcher.patch();
    coreEvents.on(CoreEvent.UserFeedback, handleUserFeedback);
    coreEvents.drainBacklogs();

    await config.initialize();
    const geminiClient = config.getGeminiClient();

    // Initialize chat. Resume if resume data is passed.
    if (resumedSessionData) {
      await geminiClient.resumeChat(
        convertSessionToHistoryFormats(resumedSessionData.conversation.messages)
          .clientHistory,
        resumedSessionData,
      );
    }

    // Signal ready state
    writeToStdout('Gemini CLI ready (simple interactive mode)\n');
    if (config.getDebugMode()) {
      writeToStderr(
        `[DEBUG] Running in non-TTY mode. Session ID: ${config.getSessionId()}\n`,
      );
    }

    // Handle line-by-line input
    rl.on('line', async (inputLine: string) => {
      if (isProcessing) {
        writeToStderr('[WARNING] Still processing previous request\n');
        return;
      }

      const input = inputLine.trim();
      if (!input) {
        return; // Ignore empty lines
      }

      isProcessing = true;
      const prompt_id = Math.random().toString(16).slice(2);

      try {
        await promptIdContext.run(prompt_id, async () => {
          let query: Part[] | undefined;

          // Handle slash commands
          if (isSlashCommand(input)) {
            const slashCommandResult = await handleSlashCommand(
              input,
              abortController,
              config,
              settings,
            );
            if (slashCommandResult) {
              query = slashCommandResult as Part[];
            }
          }

          // Handle @ commands and normal text
          if (!query) {
            const { processedQuery, shouldProceed } = await handleAtCommand({
              query: input,
              config,
              addItem: (_item, _timestamp) => 0,
              onDebugMessage: () => {},
              messageId: Date.now(),
              signal: abortController.signal,
            });

            if (!shouldProceed || !processedQuery) {
              writeToStderr('[ERROR] Failed to process @ command\n');
              isProcessing = false;
              return;
            }
            query = processedQuery as Part[];
          }

          let currentMessages: Content[] = [{ role: 'user', parts: query }];
          let turnCount = 0;

          // Main interaction loop
          while (true) {
            turnCount++;
            if (
              config.getMaxSessionTurns() >= 0 &&
              turnCount > config.getMaxSessionTurns()
            ) {
              handleMaxTurnsExceededError(config);
            }

            const toolCallRequests: ToolCallRequestInfo[] = [];

            const responseStream = geminiClient.sendMessageStream(
              currentMessages[0]?.parts || [],
              abortController.signal,
              prompt_id,
            );

            for await (const event of responseStream) {
              if (abortController.signal.aborted) {
                handleCancellationError(config);
              }

              if (event.type === GeminiEventType.Content) {
                if (event.value) {
                  textOutput.write(event.value);
                }
              } else if (event.type === GeminiEventType.ToolCallRequest) {
                toolCallRequests.push(event.value);
              } else if (event.type === GeminiEventType.LoopDetected) {
                writeToStderr('[WARNING] Loop detected, stopping execution\n');
              } else if (event.type === GeminiEventType.MaxSessionTurns) {
                writeToStderr('[ERROR] Maximum session turns exceeded\n');
              } else if (event.type === GeminiEventType.Error) {
                throw event.value.error;
              }
            }

            if (toolCallRequests.length > 0) {
              textOutput.ensureTrailingNewline();
              const toolResponseParts: Part[] = [];
              const completedToolCalls: CompletedToolCall[] = [];

              for (const requestInfo of toolCallRequests) {
                if (config.getDebugMode()) {
                  writeToStderr(
                    `[DEBUG] Executing tool: ${requestInfo.name}\n`,
                  );
                }

                const completedToolCall = await executeToolCall(
                  config,
                  requestInfo,
                  abortController.signal,
                );
                const toolResponse = completedToolCall.response;

                completedToolCalls.push(completedToolCall);

                if (toolResponse.error) {
                  handleToolError(
                    requestInfo.name,
                    toolResponse.error,
                    config,
                    toolResponse.errorType || 'TOOL_EXECUTION_ERROR',
                    typeof toolResponse.resultDisplay === 'string'
                      ? toolResponse.resultDisplay
                      : undefined,
                  );
                }

                if (toolResponse.responseParts) {
                  toolResponseParts.push(...toolResponse.responseParts);
                }
              }

              // Record tool calls with full metadata
              try {
                const currentModel =
                  geminiClient.getCurrentSequenceModel() ?? config.getModel();
                geminiClient
                  .getChat()
                  .recordCompletedToolCalls(currentModel, completedToolCalls);
              } catch (error) {
                debugLogger.error(
                  `Error recording completed tool call information: ${error}`,
                );
              }

              currentMessages = [{ role: 'user', parts: toolResponseParts }];
            } else {
              textOutput.ensureTrailingNewline();
              isProcessing = false;
              return;
            }
          }
        });
      } catch (error) {
        writeToStderr(
          `[ERROR] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        isProcessing = false;
      }
    });

    // Handle EOF (stdin closed)
    rl.on('close', async () => {
      if (config.getDebugMode()) {
        writeToStderr('[DEBUG] stdin closed, exiting\n');
      }
      consolePatcher.cleanup();
      coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
      if (isTelemetrySdkInitialized()) {
        await shutdownTelemetry(config);
      }
      process.exit(0);
    });

    // Handle SIGTERM and SIGINT
    const handleSignal = async (signal: string) => {
      if (config.getDebugMode()) {
        writeToStderr(`[DEBUG] Received ${signal}, shutting down\n`);
      }
      rl.close();
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));

    // Keep process alive (readline will handle it)
    await new Promise(() => {}); // Never resolves, keeps event loop alive
  } catch (error) {
    errorToHandle = error;
  } finally {
    consolePatcher.cleanup();
    coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }

  if (errorToHandle) {
    handleError(errorToHandle, config);
  }
}
