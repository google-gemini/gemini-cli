/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ResumedSessionData,
  UserFeedbackPayload,
  AgentEvent,
  ContentPart,
} from '@google/gemini-cli-core';
import { isSlashCommand } from './ui/utils/commandUtils.js';
import type { LoadedSettings } from './config/settings.js';
import {
  convertSessionToClientHistory,
  FatalInputError,
  promptIdContext,
  OutputFormat,
  JsonFormatter,
  StreamJsonFormatter,
  JsonStreamEventType,
  uiTelemetryService,
  coreEvents,
  CoreEvent,
  createWorkingStdio,
  Scheduler,
  ROOT_SCHEDULER_ID,
  LegacyAgentSession,
  ToolErrorType,
  geminiPartsToContentParts,
} from '@google/gemini-cli-core';

import type { Part } from '@google/genai';
import readline from 'node:readline';
import stripAnsi from 'strip-ansi';

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

export async function runNonInteractive({
  config,
  settings,
  input,
  prompt_id,
  resumedSessionData,
}: RunNonInteractiveParams): Promise<void> {
  return promptIdContext.run(prompt_id, async () => {
    const consolePatcher = new ConsolePatcher({
      stderr: true,
      debugMode: config.getDebugMode(),
      onNewMessage: (msg) => {
        coreEvents.emitConsoleLog(msg.type, msg.content);
      },
    });

    if (process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET']) {
      const { setupInitialActivityLogger } = await import(
        './utils/devtoolsService.js'
      );
      await setupInitialActivityLogger(config);
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
        context: config,
        messageBus: config.getMessageBus(),
        getPreferredEditor: () => undefined,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      // Initialize chat.  Resume if resume data is passed.
      if (resumedSessionData) {
        await geminiClient.resumeChat(
          convertSessionToClientHistory(
            resumedSessionData.conversation.messages,
          ),
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
        if (slashCommandResult) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
          escapePastedAtSymbols: false,
        });
        if (error || !processedQuery) {
          throw new FatalInputError(
            error || 'Exiting due to an error processing the @ command.',
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

      // Create LegacyAgentSession — owns the agentic loop
      const session = new LegacyAgentSession({
        client: geminiClient,
        scheduler,
        config,
        promptId: prompt_id,
      });

      // Wire Ctrl+C to session abort
      abortController.signal.addEventListener('abort', () => {
        void session.abort();
      });

      // Start the agentic loop (runs in background)
      await session.send({
        message: geminiPartsToContentParts(query),
      });

      const getFirstText = (parts?: ContentPart[]): string | undefined => {
        const part = parts?.[0];
        return part?.type === 'text' ? part.text : undefined;
      };

      const emitFinalSuccessResult = (): void => {
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
          textOutput.ensureTrailingNewline();
        }
      };

      const reconstructFatalError = (event: AgentEvent<'error'>): Error => {
        const errToThrow = new Error(event.message);
        const errorMeta = event._meta;
        if (errorMeta?.['exitCode'] !== undefined) {
          Object.defineProperty(errToThrow, 'exitCode', {
            value: errorMeta['exitCode'],
            enumerable: true,
          });
        }
        if (errorMeta?.['errorName'] !== undefined) {
          Object.defineProperty(errToThrow, 'name', {
            value: errorMeta['errorName'],
            enumerable: true,
          });
        }
        if (errorMeta?.['code'] !== undefined) {
          Object.defineProperty(errToThrow, 'code', {
            value: errorMeta['code'],
            enumerable: true,
          });
        }
        return errToThrow;
      };

      // Consume AgentEvents for output formatting
      let responseText = '';
      let streamEnded = false;
      for await (const event of session.stream()) {
        if (streamEnded) break;
        switch (event.type) {
          case 'message': {
            if (event.role === 'agent') {
              for (const part of event.content) {
                if (part.type === 'text') {
                  const isRaw =
                    config.getRawOutput() || config.getAcceptRawOutputRisk();
                  const output = isRaw ? part.text : stripAnsi(part.text);
                  if (streamFormatter) {
                    streamFormatter.emitEvent({
                      type: JsonStreamEventType.MESSAGE,
                      timestamp: new Date().toISOString(),
                      role: 'assistant',
                      content: output,
                      delta: true,
                    });
                  } else if (config.getOutputFormat() === OutputFormat.JSON) {
                    responseText += output;
                  } else {
                    if (part.text) {
                      textOutput.write(output);
                    }
                  }
                }
              }
            }
            break;
          }
          case 'tool_request': {
            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.TOOL_USE,
                timestamp: new Date().toISOString(),
                tool_name: event.name,
                tool_id: event.requestId,
                parameters: event.args,
              });
            }
            break;
          }
          case 'tool_response': {
            textOutput.ensureTrailingNewline();
            if (streamFormatter) {
              const displayText = getFirstText(event.displayContent);
              const errorMsg = getFirstText(event.content) ?? 'Tool error';
              streamFormatter.emitEvent({
                type: JsonStreamEventType.TOOL_RESULT,
                timestamp: new Date().toISOString(),
                tool_id: event.requestId,
                status: event.isError ? 'error' : 'success',
                output: displayText,
                error: event.isError
                  ? {
                      type:
                        typeof event.data?.['errorType'] === 'string'
                          ? event.data['errorType']
                          : 'TOOL_EXECUTION_ERROR',
                      message: errorMsg,
                    }
                  : undefined,
              });
            }
            if (event.isError) {
              const displayText = getFirstText(event.displayContent);
              const errorMsg = getFirstText(event.content) ?? 'Tool error';

              if (event.data?.['errorType'] === ToolErrorType.STOP_EXECUTION) {
                const stopMessage = `Agent execution stopped: ${errorMsg}`;
                if (config.getOutputFormat() === OutputFormat.TEXT) {
                  process.stderr.write(`${stopMessage}\n`);
                }
              }

              handleToolError(
                event.name,
                new Error(errorMsg),
                config,
                typeof event.data?.['errorType'] === 'string'
                  ? event.data['errorType']
                  : undefined,
                displayText,
              );
            }
            break;
          }
          case 'error': {
            if (event.fatal) {
              throw reconstructFatalError(event);
            }

            const errorCode = event._meta?.['code'];

            if (errorCode === 'AGENT_EXECUTION_BLOCKED') {
              if (config.getOutputFormat() === OutputFormat.TEXT) {
                process.stderr.write(`[WARNING] ${event.message}\n`);
              }
              break;
            }

            const severity =
              event.status === 'RESOURCE_EXHAUSTED' ? 'error' : 'warning';
            if (config.getOutputFormat() === OutputFormat.TEXT) {
              process.stderr.write(`[WARNING] ${event.message}\n`);
            }
            if (streamFormatter) {
              streamFormatter.emitEvent({
                type: JsonStreamEventType.ERROR,
                timestamp: new Date().toISOString(),
                severity,
                message: event.message,
              });
            }
            break;
          }
          case 'stream_end': {
            if (event.reason === 'aborted') {
              handleCancellationError(config);
            } else if (event.reason === 'max_turns') {
              const isSessionLimit =
                typeof event.data?.['maxTurns'] === 'number' &&
                typeof event.data?.['turnCount'] === 'number';
              if (isSessionLimit) {
                handleMaxTurnsExceededError(config);
              }
              if (streamFormatter) {
                streamFormatter.emitEvent({
                  type: JsonStreamEventType.ERROR,
                  timestamp: new Date().toISOString(),
                  severity: 'error',
                  message: 'Maximum session turns exceeded',
                });
              }
            }

            const stopMessage =
              typeof event.data?.['message'] === 'string'
                ? event.data['message']
                : '';
            if (stopMessage && config.getOutputFormat() === OutputFormat.TEXT) {
              process.stderr.write(`Agent execution stopped: ${stopMessage}\n`);
            }

            emitFinalSuccessResult();
            streamEnded = true;
            break;
          }
          case 'custom': {
            if (event.kind === 'loop_detected') {
              if (streamFormatter) {
                streamFormatter.emitEvent({
                  type: JsonStreamEventType.ERROR,
                  timestamp: new Date().toISOString(),
                  severity: 'warning',
                  message: 'Loop detected, stopping execution',
                });
              }
            }
            break;
          }
          default:
            break;
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
  });
}
