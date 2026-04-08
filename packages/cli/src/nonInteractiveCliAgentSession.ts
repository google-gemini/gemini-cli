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
  FatalError,
  FatalAuthenticationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
  FatalCancellationError,
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
  debugLogger,
} from '@google/gemini-cli-core';

import type { Part } from '@google/genai';
import readline from 'node:readline';
import stripAnsi from 'strip-ansi';

import { handleSlashCommand } from './nonInteractiveCliCommands.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import { handleError, handleToolError } from './utils/errors.js';
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
      interactive: false,
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
    let scheduler: Scheduler | undefined;
    let abortSession = () => {};
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
          cleanupStdinCancellation();
          consolePatcher.cleanup();
          process.exit(0);
        }
      });

      const geminiClient = config.getGeminiClient();
      scheduler = new Scheduler({
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
      abortSession = () => {
        void session.abort();
      };
      abortController.signal.addEventListener('abort', abortSession);
      if (abortController.signal.aborted) {
        throw new FatalCancellationError('Operation cancelled.');
      }

      // Start the agentic loop (runs in background)
      const { streamId } = await session.send({
        message: {
          content: geminiPartsToContentParts(query),
          displayContent: input,
        },
      });
      if (streamId === null) {
        throw new Error(
          'LegacyAgentSession.send() unexpectedly returned no stream for a message send.',
        );
      }

      const getTextContent = (parts?: ContentPart[]): string | undefined => {
        const text = parts
          ?.map((part) => (part.type === 'text' ? part.text : ''))
          .join('');
        return text ? text : undefined;
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
        const errorMeta = event._meta;
        const name =
          typeof errorMeta?.['errorName'] === 'string'
            ? errorMeta['errorName']
            : undefined;

        let errToThrow: Error;
        switch (name) {
          case 'FatalAuthenticationError':
            errToThrow = new FatalAuthenticationError(event.message);
            break;
          case 'FatalInputError':
            errToThrow = new FatalInputError(event.message);
            break;
          case 'FatalSandboxError':
            errToThrow = new FatalSandboxError(event.message);
            break;
          case 'FatalConfigError':
            errToThrow = new FatalConfigError(event.message);
            break;
          case 'FatalTurnLimitedError':
            errToThrow = new FatalTurnLimitedError(event.message);
            break;
          case 'FatalToolExecutionError':
            errToThrow = new FatalToolExecutionError(event.message);
            break;
          case 'FatalCancellationError':
            errToThrow = new FatalCancellationError(event.message);
            break;
          case 'FatalError':
            errToThrow = new FatalError(
              event.message,
              typeof errorMeta?.['exitCode'] === 'number'
                ? errorMeta['exitCode']
                : 1,
            );
            break;
          default:
            errToThrow = new Error(event.message);
            if (name) {
              Object.defineProperty(errToThrow, 'name', {
                value: name,
                enumerable: true,
              });
            }
            break;
        }

        if (errorMeta?.['exitCode'] !== undefined) {
          Object.defineProperty(errToThrow, 'exitCode', {
            value: errorMeta['exitCode'],
            enumerable: true,
          });
        }
        if (errorMeta?.['code'] !== undefined) {
          Object.defineProperty(errToThrow, 'code', {
            value: errorMeta['code'],
            enumerable: true,
          });
        }
        if (errorMeta?.['status'] !== undefined) {
          Object.defineProperty(errToThrow, 'status', {
            value: errorMeta['status'],
            enumerable: true,
          });
        }
        return errToThrow;
      };

      // Consume AgentEvents for output formatting
      let responseText = '';
      let preToolResponseText: string | undefined;
      let streamEnded = false;
      for await (const event of session.stream({ streamId })) {
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
            if (config.getOutputFormat() === OutputFormat.JSON) {
              // Final JSON output should reflect the last assistant answer after
              // any tool orchestration, not intermediate pre-tool text.
              preToolResponseText = responseText || preToolResponseText;
              responseText = '';
            }
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
              const displayText = getTextContent(event.displayContent);
              const errorMsg = getTextContent(event.content) ?? 'Tool error';
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
              const displayText = getTextContent(event.displayContent);
              const errorMsg = getTextContent(event.content) ?? 'Tool error';

              if (event.data?.['errorType'] === ToolErrorType.STOP_EXECUTION) {
                if (
                  config.getOutputFormat() === OutputFormat.JSON &&
                  !responseText &&
                  preToolResponseText
                ) {
                  responseText = preToolResponseText;
                }
                const stopMessage = `Agent execution stopped: ${errorMsg}`;
                if (config.getOutputFormat() === OutputFormat.TEXT) {
                  process.stderr.write(`${stopMessage}\n`);
                }
              }

              if (event.data?.['errorType'] === ToolErrorType.NO_SPACE_LEFT) {
                throw new FatalToolExecutionError(
                  'Error executing tool ' +
                    event.name +
                    ': ' +
                    (displayText || errorMsg),
                );
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
          case 'agent_end': {
            if (event.reason === 'aborted') {
              throw new FatalCancellationError('Operation cancelled.');
            } else if (event.reason === 'max_turns') {
              const isConfiguredTurnLimit =
                typeof event.data?.['maxTurns'] === 'number' ||
                typeof event.data?.['turnCount'] === 'number';

              if (isConfiguredTurnLimit) {
                throw new FatalTurnLimitedError(
                  'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
                );
              } else if (streamFormatter) {
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
          case 'initialize':
          case 'session_update':
          case 'agent_start':
          case 'tool_update':
          case 'elicitation_request':
          case 'elicitation_response':
          case 'usage':
          case 'custom':
            // Explicitly ignore these non-interactive events
            break;
          default:
            debugLogger.error('Unknown agent event type:', event);
            event satisfies never;
            break;
        }
      }
    } catch (error) {
      errorToHandle = error;
    } finally {
      // Cleanup stdin cancellation before other cleanup
      cleanupStdinCancellation();
      abortController.signal.removeEventListener('abort', abortSession);

      scheduler?.dispose();
      consolePatcher.cleanup();
      coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
    }

    if (errorToHandle) {
      handleError(errorToHandle, config);
    }
  });
}
