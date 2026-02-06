/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolCallRequestInfo,
  ResumedSessionData,
  UserFeedbackPayload,
} from '@google/gemini-cli-core';
import { isSlashCommand } from './ui/utils/commandUtils.js';
import type { LoadedSettings } from './config/settings.js';
import {
  GeminiEventType,
  FatalInputError,
  promptIdContext,
  OutputFormat,
  JsonFormatter,
  StreamJsonFormatter,
  JsonStreamEventType,
  uiTelemetryService,
  debugLogger,
  coreEvents,
  CoreEvent,
  createWorkingStdio,
  recordToolCallInteractions,
  ToolErrorType,
  Scheduler,
  ROOT_SCHEDULER_ID,
} from '@google/gemini-cli-core';

import type { Content, Part } from '@google/genai';
import readline from 'node:readline';
import stripAnsi from 'strip-ansi';

import { convertSessionToHistoryFormats } from './ui/hooks/useSessionBrowser.js';
import { handleSlashCommand } from './nonInteractiveCliCommands.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import {
  handleError,
  handleToolError,
  handleCancellationError,
  handleMaxTurnsExceededError,
} from './utils/errors.js';
import { TextOutput } from './ui/utils/textOutput.js';

interface RunNonInteractiveParams {
  config: Config;
  settings: LoadedSettings;
  input: string;
  prompt_id: string;
  resumedSessionData?: ResumedSessionData;
}

interface IterationResult {
  iteration: number;
  status: 'Success' | 'Failed';
  testsPassed?: number;
  testsFailed?: number;
  testsTotal?: number;
}

function extractTestStats(output: string): {
  passed?: number;
  failed?: number;
  total?: number;
} {
  // Common patterns for test runners (Vitest, Jest, Mocha, etc.)
  const patterns = [
    // Vitest/Jest: "Tests:       3 passed, 1 failed, 4 total"
    /Tests:\s*(?:(\d+)\s+passed)?(?:,\s*)?(?:(\d+)\s+failed)?(?:,\s*)?(?:(\d+)\s+total)?/i,
    // Mocha: "3 passing (10ms)"
    /(\d+)\s+passing/i,
    // Mocha: "1 failing"
    /(\d+)\s+failing/i,
    // Generic: "Passed: 3, Failed: 1"
    /Passed:\s*(\d+)/i,
    /Failed:\s*(\d+)/i,
  ];

  let passed: number | undefined;
  let failed: number | undefined;
  let total: number | undefined;

  // Try Vitest/Jest pattern first as it is most comprehensive
  const vitestMatch = output.match(patterns[0]);
  if (vitestMatch && (vitestMatch[1] || vitestMatch[2] || vitestMatch[3])) {
    passed = vitestMatch[1] ? parseInt(vitestMatch[1], 10) : 0;
    failed = vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0;
    total = vitestMatch[3] ? parseInt(vitestMatch[3], 10) : 0;
    return { passed, failed, total };
  }

  // Fallback to individual patterns
  const passingMatch = output.match(patterns[1]);
  if (passingMatch) {
    passed = parseInt(passingMatch[1], 10);
  } else {
    const passedMatch = output.match(patterns[3]);
    if (passedMatch) passed = parseInt(passedMatch[1], 10);
  }

  const failingMatch = output.match(patterns[2]);
  if (failingMatch) {
    failed = parseInt(failingMatch[1], 10);
  } else {
    const failedMatch = output.match(patterns[4]);
    if (failedMatch) failed = parseInt(failedMatch[1], 10);
  }

  return { passed, failed, total };
}

function printSummary(results: IterationResult[]) {
  process.stderr.write('\n--- Ralph Wiggum Mode Summary ---\n');
  process.stderr.write(
    '| Iteration | Status  | Tests Passed | Tests Failed |\n',
  );
  process.stderr.write(
    '|-----------|---------|--------------|--------------|\n',
  );
  for (const result of results) {
    const passed = result.testsPassed !== undefined ? result.testsPassed : '-';
    const failed = result.testsFailed !== undefined ? result.testsFailed : '-';
    process.stderr.write(
      `| ${result.iteration.toString().padEnd(9)} | ${result.status.padEnd(7)} | ${passed.toString().padEnd(12)} | ${failed.toString().padEnd(12)} |\n`,
    );
  }
  process.stderr.write('---------------------------------\n\n');
}

import fs from 'node:fs';
import path from 'node:path';

// ... (existing imports)

export async function runRalphWiggum({
  config,
  settings,
  input,
  prompt_id,
  resumedSessionData,
  completionPromise,
  maxIterations,
  memoryFile,
}: RunNonInteractiveParams & {
  completionPromise?: string;
  maxIterations?: number;
  memoryFile?: string;
}): Promise<void> {
  const effectiveMaxIterations = maxIterations ?? 10;
  let iterations = 0;
  let currentResumedSessionData = resumedSessionData;
  const results: IterationResult[] = [];
  const effectiveMemoryFile = memoryFile || 'memories.md';
  const memoriesPath = path.join(process.cwd(), effectiveMemoryFile);

  if (!fs.existsSync(memoriesPath)) {
    fs.writeFileSync(
      memoriesPath,
      `# Ralph Wiggum Memories\n\nTask: ${input}\n\nUse this file (${effectiveMemoryFile}) to store notes on what worked and what didn't work across iterations. The agent will read this at the start of each run.\n\n`,
    );
  }

  process.stderr.write(
    `[Ralph Wiggum] Starting loop. Max iterations: ${effectiveMaxIterations}\n`,
  );

  while (iterations < effectiveMaxIterations) {
    iterations++;
    process.stderr.write(
      `[Ralph Wiggum] Iteration ${iterations}/${effectiveMaxIterations}\n`,
    );

    let currentInput = input;
    try {
      if (fs.existsSync(memoriesPath)) {
        const memories = fs.readFileSync(memoriesPath, 'utf-8');
        if (memories.trim()) {
          currentInput = `Context from previous iterations (${effectiveMemoryFile}):\n${memories}\n\nTask:\n${input}`;
          process.stderr.write(
            `[Ralph Wiggum] Loaded context from ${effectiveMemoryFile}\n`,
          );
        }
      }
    } catch (error) {
      process.stderr.write(
        `[Ralph Wiggum] Failed to read ${effectiveMemoryFile}: ${error}\n`,
      );
    }

    const output = await runNonInteractive({
      config,
      settings,
      input: currentInput,
      prompt_id,
      resumedSessionData: currentResumedSessionData,
    });

    const stats = extractTestStats(output);
    const success =
      completionPromise && output.includes(completionPromise) ? true : false;

    results.push({
      iteration: iterations,
      status: success ? 'Success' : 'Failed',
      testsPassed: stats.passed,
      testsFailed: stats.failed,
      testsTotal: stats.total,
    });

    if (success) {
      process.stderr.write(
        `[Ralph Wiggum] Completion promise "${completionPromise}" met. Exiting.\n`,
      );
      printSummary(results);
      return;
    }

    // Clear resumedSessionData so we don't try to resume partially through
    currentResumedSessionData = undefined;
  }
  process.stderr.write(
    `[Ralph Wiggum] Max iterations reached without meeting completion promise.\n`,
  );
  printSummary(results);
}

export async function runNonInteractive({
  config,
  settings,
  input,
  prompt_id,
  resumedSessionData,
}: RunNonInteractiveParams): Promise<string> {
  return promptIdContext.run(prompt_id, async () => {
    const consolePatcher = new ConsolePatcher({
      stderr: true,
      debugMode: config.getDebugMode(),
      onNewMessage: (msg) => {
        coreEvents.emitConsoleLog(msg.type, msg.content);
      },
    });

    if (config.storage && process.env['GEMINI_CLI_ACTIVITY_LOG_FILE']) {
      const { registerActivityLogger } = await import(
        './utils/activityLogger.js'
      );
      registerActivityLogger(config);
    }

    const { stdout: workingStdout } = createWorkingStdio();
    const textOutput = new TextOutput(workingStdout);

    const handleUserFeedback = (payload: UserFeedbackPayload) => {
      const prefix = payload.severity.toUpperCase();
      process.stderr.write(`[${prefix}] ${payload.message}\n`);
      if (payload.error && config.getDebugMode()) {
        const errorToLog =
          payload.error instanceof Error
            ? payload.error.stack || payload.error.message
            : String(payload.error);
        process.stderr.write(`${errorToLog}\n`);
      }
    };

    const startTime = Date.now();
    const streamFormatter =
      config.getOutputFormat() === OutputFormat.STREAM_JSON
        ? new StreamJsonFormatter()
        : null;

    const abortController = new AbortController();

    // Track cancellation state
    let isAborting = false;
    let cancelMessageTimer: NodeJS.Timeout | null = null;

    // Setup stdin listener for Ctrl+C detection
    let stdinWasRaw = false;
    let rl: readline.Interface | null = null;

    const setupStdinCancellation = () => {
      // Only setup if stdin is a TTY (user can interact)
      if (!process.stdin.isTTY) {
        return;
      }

      // Save original raw mode state
      stdinWasRaw = process.stdin.isRaw || false;

      // Enable raw mode to capture individual keypresses
      process.stdin.setRawMode(true);
      process.stdin.resume();

      // Setup readline to emit keypress events
      rl = readline.createInterface({
        input: process.stdin,
        escapeCodeTimeout: 0,
      });
      readline.emitKeypressEvents(process.stdin, rl);

      // Listen for Ctrl+C
      const keypressHandler = (
        str: string,
        key: { name?: string; ctrl?: boolean },
      ) => {
        // Detect Ctrl+C: either ctrl+c key combo or raw character code 3
        if ((key && key.ctrl && key.name === 'c') || str === '\u0003') {
          // Only handle once
          if (isAborting) {
            return;
          }

          isAborting = true;

          // Only show message if cancellation takes longer than 200ms
          // This reduces verbosity for fast cancellations
          cancelMessageTimer = setTimeout(() => {
            process.stderr.write('\nCancelling...\n');
          }, 200);

          abortController.abort();
          // Note: Don't exit here - let the abort flow through the system
          // and trigger handleCancellationError() which will exit with proper code
        }
      };

      process.stdin.on('keypress', keypressHandler);
    };

    const cleanupStdinCancellation = () => {
      // Clear any pending cancel message timer
      if (cancelMessageTimer) {
        clearTimeout(cancelMessageTimer);
        cancelMessageTimer = null;
      }

      // Cleanup readline and stdin listeners
      if (rl) {
        rl.close();
        rl = null;
      }

      // Remove keypress listener
      process.stdin.removeAllListeners('keypress');

      // Restore stdin to original state
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(stdinWasRaw);
        process.stdin.pause();
      }
    };

    // Store accumulated response text to return
    let fullResponseText = '';

    let errorToHandle: unknown | undefined;
    try {
      consolePatcher.patch();

      if (
        config.getRawOutput() &&
        !config.getAcceptRawOutputRisk() &&
        config.getOutputFormat() === OutputFormat.TEXT
      ) {
        process.stderr.write(
          '[WARNING] --raw-output is enabled. Model output is not sanitized and may contain harmful ANSI sequences (e.g. for phishing or command injection). Use --accept-raw-output-risk to suppress this warning.\n',
        );
      }

      // Setup stdin cancellation listener
      setupStdinCancellation();

      coreEvents.on(CoreEvent.UserFeedback, handleUserFeedback);
      coreEvents.drainBacklogs();

      // Handle EPIPE errors when the output is piped to a command that closes early.
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          // Exit gracefully if the pipe is closed.
          process.exit(0);
        }
      });

      const geminiClient = config.getGeminiClient();
      const scheduler = new Scheduler({
        config,
        messageBus: config.getMessageBus(),
        getPreferredEditor: () => undefined,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      // Initialize chat.  Resume if resume data is passed.
      if (resumedSessionData) {
        await geminiClient.resumeChat(
          convertSessionToHistoryFormats(
            resumedSessionData.conversation.messages,
          ).clientHistory,
          resumedSessionData,
        );
      }

      // Emit init event for streaming JSON
      if (streamFormatter) {
        streamFormatter.emitEvent({
          type: JsonStreamEventType.INIT,
          timestamp: new Date().toISOString(),
          session_id: config.getSessionId(),
          model: config.getModel(),
        });
      }

      let query: Part[] | undefined;

      if (isSlashCommand(input)) {
        const slashCommandResult = await handleSlashCommand(
          input,
          abortController,
          config,
          settings,
        );
        // If a slash command is found and returns a prompt, use it.
        // Otherwise, slashCommandResult falls through to the default prompt
        // handling.
        if (slashCommandResult) {
          query = slashCommandResult as Part[];
        }
      }

      if (!query) {
        const { processedQuery, error } = await handleAtCommand({
          query: input,
          config,
          addItem: (_item, _timestamp) => 0,
          onDebugMessage: () => {},
          messageId: Date.now(),
          signal: abortController.signal,
        });

        if (error || !processedQuery) {
          // An error occurred during @include processing (e.g., file not found).
          // The error message is already logged by handleAtCommand.
          throw new FatalInputError(
            error || 'Exiting due to an error processing the @ command.',
          );
        }
        query = processedQuery as Part[];
      }

      // Emit user message event for streaming JSON
      if (streamFormatter) {
        streamFormatter.emitEvent({
          type: JsonStreamEventType.MESSAGE,
          timestamp: new Date().toISOString(),
          role: 'user',
          content: input,
        });
      }

      let currentMessages: Content[] = [{ role: 'user', parts: query }];

      let turnCount = 0;
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
          undefined,
          false,
          turnCount === 1 ? input : undefined,
        );

        let responseText = '';
        for await (const event of responseStream) {
          if (abortController.signal.aborted) {
            handleCancellationError(config);
          }

          if (event.type === GeminiEventType.Content) {
            const isRaw =
              config.getRawOutput() || config.getAcceptRawOutputRisk();
            const output = isRaw ? event.value : stripAnsi(event.value);

            // Accumulate full response
            if (event.value) {
              fullResponseText += event.value;
              responseText += output;
            }

            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.MESSAGE,
                timestamp: new Date().toISOString(),
                role: 'assistant',
                content: output,
                delta: true,
              });
            } else if (config.getOutputFormat() === OutputFormat.JSON) {
              // responseText is already updated
            } else {
              if (event.value) {
                textOutput.write(output);
              }
            }
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.TOOL_USE,
                timestamp: new Date().toISOString(),
                tool_name: event.value.name,
                tool_id: event.value.callId,
                parameters: event.value.args,
              });
            }
            toolCallRequests.push(event.value);
          } else if (event.type === GeminiEventType.LoopDetected) {
            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.ERROR,
                timestamp: new Date().toISOString(),
                severity: 'warning',
                message: 'Loop detected, stopping execution',
              });
            }
          } else if (event.type === GeminiEventType.MaxSessionTurns) {
            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.ERROR,
                timestamp: new Date().toISOString(),
                severity: 'error',
                message: 'Maximum session turns exceeded',
              });
            }
          } else if (event.type === GeminiEventType.Error) {
            throw event.value.error;
          } else if (event.type === GeminiEventType.AgentExecutionStopped) {
            const stopMessage = `Agent execution stopped: ${event.value.systemMessage?.trim() || event.value.reason}`;
            if (config.getOutputFormat() === OutputFormat.TEXT) {
              process.stderr.write(`${stopMessage}\n`);
            }
            // Emit final result event for streaming JSON if needed
            if (streamFormatter) {
              const metrics = uiTelemetryService.getMetrics();
              const durationMs = Date.now() - startTime;
              streamFormatter.emitEvent({
                type: JsonStreamEventType.RESULT,
                timestamp: new Date().toISOString(),
                status: 'success',
                stats: streamFormatter.convertToStreamStats(
                  metrics,
                  durationMs,
                ),
              });
            }
            return fullResponseText;
          } else if (event.type === GeminiEventType.AgentExecutionBlocked) {
            const blockMessage = `Agent execution blocked: ${event.value.systemMessage?.trim() || event.value.reason}`;
            if (config.getOutputFormat() === OutputFormat.TEXT) {
              process.stderr.write(`[WARNING] ${blockMessage}\n`);
            }
          }
        }

        if (toolCallRequests.length > 0) {
          textOutput.ensureTrailingNewline();
          const completedToolCalls = await scheduler.schedule(
            toolCallRequests,
            abortController.signal,
          );
          const toolResponseParts: Part[] = [];

          for (const completedToolCall of completedToolCalls) {
            const toolResponse = completedToolCall.response;
            const requestInfo = completedToolCall.request;

            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.TOOL_RESULT,
                timestamp: new Date().toISOString(),
                tool_id: requestInfo.callId,
                status:
                  completedToolCall.status === 'error' ? 'error' : 'success',
                output:
                  typeof toolResponse.resultDisplay === 'string'
                    ? toolResponse.resultDisplay
                    : undefined,
                error: toolResponse.error
                  ? {
                      type: toolResponse.errorType || 'TOOL_EXECUTION_ERROR',
                      message: toolResponse.error.message,
                    }
                  : undefined,
              });
            }

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

          // Record tool calls with full metadata before sending responses to Gemini
          try {
            const currentModel =
              geminiClient.getCurrentSequenceModel() ?? config.getModel();
            geminiClient
              .getChat()
              .recordCompletedToolCalls(currentModel, completedToolCalls);

            await recordToolCallInteractions(config, completedToolCalls);
          } catch (error) {
            debugLogger.error(
              `Error recording completed tool call information: ${error}`,
            );
          }

          // Check if any tool requested to stop execution immediately
          const stopExecutionTool = completedToolCalls.find(
            (tc) => tc.response.errorType === ToolErrorType.STOP_EXECUTION,
          );

          if (stopExecutionTool && stopExecutionTool.response.error) {
            const stopMessage = `Agent execution stopped: ${stopExecutionTool.response.error.message}`;

            if (config.getOutputFormat() === OutputFormat.TEXT) {
              process.stderr.write(`${stopMessage}\n`);
            }

            // Emit final result event for streaming JSON
            if (streamFormatter) {
              const metrics = uiTelemetryService.getMetrics();
              const durationMs = Date.now() - startTime;
              streamFormatter.emitEvent({
                type: JsonStreamEventType.RESULT,
                timestamp: new Date().toISOString(),
                status: 'success',
                stats: streamFormatter.convertToStreamStats(
                  metrics,
                  durationMs,
                ),
              });
            } else if (config.getOutputFormat() === OutputFormat.JSON) {
              const formatter = new JsonFormatter();
              const stats = uiTelemetryService.getMetrics();
              textOutput.write(
                formatter.format(config.getSessionId(), responseText, stats),
              );
            } else {
              textOutput.ensureTrailingNewline(); // Ensure a final newline
            }
            return fullResponseText;
          }

          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          // Emit final result event for streaming JSON
          if (streamFormatter) {
            const metrics = uiTelemetryService.getMetrics();
            const durationMs = Date.now() - startTime;
            streamFormatter.emitEvent({
              type: JsonStreamEventType.RESULT,
              timestamp: new Date().toISOString(),
              status: 'success',
              stats: streamFormatter.convertToStreamStats(metrics, durationMs),
            });
          } else if (config.getOutputFormat() === OutputFormat.JSON) {
            const formatter = new JsonFormatter();
            const stats = uiTelemetryService.getMetrics();
            textOutput.write(
              formatter.format(config.getSessionId(), responseText, stats),
            );
          } else {
            textOutput.ensureTrailingNewline(); // Ensure a final newline
          }
          return fullResponseText;
        }
      }
    } catch (error) {
      errorToHandle = error;
    } finally {
      // Cleanup stdin cancellation before other cleanup
      cleanupStdinCancellation();

      consolePatcher.cleanup();
      coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
    }

    if (errorToHandle) {
      handleError(errorToHandle, config);
    }
    return fullResponseText;
  });
}
