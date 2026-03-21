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
import type { LoadedSettings } from './config/settings.js';
import {
  convertSessionToClientHistory,
  GeminiEventType,
  FatalInputError,
  promptIdContext,
  OutputFormat,
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

import { isSlashCommand } from './ui/utils/commandUtils.js';
import { handleSlashCommand } from './nonInteractiveCliCommands.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import {
  handleToolError,
  handleCancellationError,
  handleMaxTurnsExceededError,
} from './utils/errors.js';
import { TextOutput } from './ui/utils/textOutput.js';

export interface RunHeadlessInteractiveParams {
  config: Config;
  settings: LoadedSettings;
  resumedSessionData?: ResumedSessionData;
}

/**
 * Runs the CLI in headless interactive mode: reads newline-delimited prompts
 * from stdin, maintains conversation state across prompts, and outputs
 * responses to stdout. No Ink UI is used.
 */
export async function runHeadlessInteractive({
  config,
  settings,
  resumedSessionData,
}: RunHeadlessInteractiveParams): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
    onNewMessage: (msg) => {
      coreEvents.emitConsoleLog(msg.type, msg.content);
    },
  });

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

  const streamFormatter =
    config.getOutputFormat() === OutputFormat.STREAM_JSON
      ? new StreamJsonFormatter()
      : null;

  const geminiClient = config.getGeminiClient();
  const scheduler = new Scheduler({
    context: config,
    messageBus: config.getMessageBus(),
    getPreferredEditor: () => undefined,
    schedulerId: ROOT_SCHEDULER_ID,
  });

  // Resume session if data is provided
  if (resumedSessionData) {
    await geminiClient.resumeChat(
      convertSessionToClientHistory(resumedSessionData.conversation.messages),
      resumedSessionData,
    );
  }

  consolePatcher.patch();

  if (process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET']) {
    const { setupInitialActivityLogger } = await import(
      './utils/devtoolsService.js'
    );
    await setupInitialActivityLogger(config);
  }

  coreEvents.on(CoreEvent.UserFeedback, handleUserFeedback);
  coreEvents.drainBacklogs();

  // Handle EPIPE errors when piped output closes early
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
  });

  // Emit init event once
  if (streamFormatter) {
    streamFormatter.emitEvent({
      type: JsonStreamEventType.INIT,
      timestamp: new Date().toISOString(),
      session_id: config.getSessionId(),
      model: config.getModel(),
    });
  }

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  let promptCount = 0;

  try {
    for await (const line of rl) {
      const input = line.trim();
      if (!input) continue;

      promptCount++;
      const promptId = `${config.getSessionId()}-${promptCount}`;

      try {
        await processPrompt({
          config,
          settings,
          input,
          promptId,
          geminiClient,
          scheduler,
          streamFormatter,
          textOutput,
        });
      } catch (error) {
        // Emit error but don't kill the session
        if (streamFormatter) {
          streamFormatter.emitEvent({
            type: JsonStreamEventType.ERROR,
            timestamp: new Date().toISOString(),
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        } else {
          process.stderr.write(
            `[ERROR] ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
      }
    }
  } finally {
    consolePatcher.cleanup();
    coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
  }
}

interface ProcessPromptParams {
  config: Config;
  settings: LoadedSettings;
  input: string;
  promptId: string;
  geminiClient: ReturnType<Config['getGeminiClient']>;
  scheduler: InstanceType<typeof Scheduler>;
  streamFormatter: StreamJsonFormatter | null;
  textOutput: TextOutput;
}

async function processPrompt({
  config,
  settings,
  input,
  promptId,
  geminiClient,
  scheduler,
  streamFormatter,
  textOutput,
}: ProcessPromptParams): Promise<void> {
  return promptIdContext.run(promptId, async () => {
    const startTime = Date.now();
    const abortController = new AbortController();

    const emitResultAndFinish = (): void => {
      if (streamFormatter) {
        const metrics = uiTelemetryService.getMetrics();
        const durationMs = Date.now() - startTime;
        streamFormatter.emitEvent({
          type: JsonStreamEventType.RESULT,
          timestamp: new Date().toISOString(),
          status: 'success',
          stats: streamFormatter.convertToStreamStats(metrics, durationMs),
        });
      }
      textOutput.ensureTrailingNewline();
    };

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
        throw new FatalInputError(error || 'Error processing the @ command.');
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      query = processedQuery as Part[];
    }

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
        promptId,
        undefined,
        false,
        turnCount === 1 ? input : undefined,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          handleCancellationError(config);
        }

        if (event.type === GeminiEventType.Content) {
          const isRaw =
            config.getRawOutput() || config.getAcceptRawOutputRisk();
          const output = isRaw ? event.value : stripAnsi(event.value);
          if (streamFormatter) {
            streamFormatter.emitEvent({
              type: JsonStreamEventType.MESSAGE,
              timestamp: new Date().toISOString(),
              role: 'assistant',
              content: output,
              delta: true,
            });
          } else if (event.value) {
            textOutput.write(output);
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
          emitResultAndFinish();
          return;
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

        const stopExecutionTool = completedToolCalls.find(
          (tc) => tc.response.errorType === ToolErrorType.STOP_EXECUTION,
        );

        if (stopExecutionTool && stopExecutionTool.response.error) {
          emitResultAndFinish();
          return;
        }

        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        emitResultAndFinish();
        return;
      }
    }
  });
}
