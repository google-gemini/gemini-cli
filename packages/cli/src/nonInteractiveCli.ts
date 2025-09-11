/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ToolCallRequestInfo } from '@google/gemini-cli-core';
import { CommandService } from './services/CommandService.js';
import { FileCommandLoader } from './services/FileCommandLoader.js';
import { type CommandContext } from './ui/commands/types.js';
import { isSlashCommand } from './ui/utils/commandUtils.js';
import type { SessionStatsState } from './ui/contexts/SessionContext.js';
import type { LoadedSettings } from './config/settings.js';
import { createNoOpUI } from './ui/commands/noOpUi.js';
import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  Logger,
  FatalInputError,
  promptIdContext,
  OutputFormat,
  JsonFormatter,
  uiTelemetryService,
} from '@google/gemini-cli-core';

import type { Content, Part, PartListUnion } from '@google/genai';
import { parseSlashCommand } from './utils/commands.js';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import {
  handleError,
  handleToolError,
  handleCancellationError,
  handleMaxTurnsExceededError,
} from './utils/errors.js';

/**
 * Processes a slash command in a non-interactive environment.
 *
 * @returns A Promise that resolves to `PartListUnion` if a valid command is
 *   found and results in a prompt, or `undefined` otherwise.
 * @throws {FatalInputError} if the command requires user confirmation, which
 *   is not supported in non-interactive mode.
 */
const handleSlashCommand = async (
  rawQuery: string,
  abortController: AbortController,
  config: Config,
  settings: LoadedSettings,
): Promise<PartListUnion | undefined> => {
  const trimmed = rawQuery.trim();
  if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) {
    return;
  }

  // Only custom commands are supported for now.
  const loaders = [new FileCommandLoader(config)];
  const commandService = await CommandService.create(
    loaders,
    abortController.signal,
  );
  const commands = commandService.getCommands();

  const { commandToExecute, args } = parseSlashCommand(rawQuery, commands);

  if (commandToExecute) {
    if (commandToExecute.action) {
      // Not used by custom commands but may be in the future.
      const sessionStats: SessionStatsState = {
        sessionId: config?.getSessionId(),
        sessionStartTime: new Date(),
        metrics: uiTelemetryService.getMetrics(),
        lastPromptTokenCount: 0,
        promptCount: 1,
      };

      const logger = new Logger(config?.getSessionId() || '', config?.storage);

      const context: CommandContext = {
        services: {
          config,
          settings,
          git: undefined,
          logger,
        },
        ui: createNoOpUI(),
        session: {
          stats: sessionStats,
          sessionShellAllowlist: new Set(),
        },
        invocation: {
          raw: trimmed,
          name: commandToExecute.name,
          args,
        },
      };

      const result = await commandToExecute.action(context, args);

      if (result) {
        switch (result.type) {
          case 'submit_prompt':
            return result.content;
          case 'confirm_shell_commands':
            throw new FatalInputError(
              'Exiting due to a confirmation prompt requested by the command.',
            );
          default:
            throw new FatalInputError(
              'Exiting due to command result that is not supported in non-interactive mode.',
            );
        }
      }
    }
  }

  return;
};

export async function runNonInteractive(
  config: Config,
  settings: LoadedSettings,
  input: string,
  prompt_id: string,
): Promise<void> {
  return promptIdContext.run(prompt_id, async () => {
    const consolePatcher = new ConsolePatcher({
      stderr: true,
      debugMode: config.getDebugMode(),
    });

    try {
      consolePatcher.patch();
      // Handle EPIPE errors when the output is piped to a command that closes early.
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          // Exit gracefully if the pipe is closed.
          process.exit(0);
        }
      });

      const geminiClient = config.getGeminiClient();

      const abortController = new AbortController();

      let query: Part[] | undefined;

      if (isSlashCommand(input)) {
        const slashCommandResult = await handleSlashCommand(
          input,
          abortController,
          config,
          settings,
        );
        // If a slash command is found and returns a prompt, use it.
        // Otherwise, slashCommandResult fall through to the default prompt
        // handling.
        if (slashCommandResult) {
          query = slashCommandResult as Part[];
        }
      }

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
          // An error occurred during @include processing (e.g., file not found).
          // The error message is already logged by handleAtCommand.
          throw new FatalInputError(
            'Exiting due to an error processing the @ command.',
          );
        }
        query = processedQuery as Part[];
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
        );

        let responseText = '';
        for await (const event of responseStream) {
          if (abortController.signal.aborted) {
            handleCancellationError(config);
          }

          if (event.type === GeminiEventType.Content) {
            if (config.getOutputFormat() === OutputFormat.JSON) {
              responseText += event.value;
            } else {
              process.stdout.write(event.value);
            }
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          }
        }

        if (toolCallRequests.length > 0) {
          const toolResponseParts: Part[] = [];
          for (const requestInfo of toolCallRequests) {
            const toolResponse = await executeToolCall(
              config,
              requestInfo,
              abortController.signal,
            );

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
          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          if (config.getOutputFormat() === OutputFormat.JSON) {
            const formatter = new JsonFormatter();
            const stats = uiTelemetryService.getMetrics();
            process.stdout.write(formatter.format(responseText, stats));
          } else {
            process.stdout.write('\n'); // Ensure a final newline
          }
          return;
        }
      }
    } catch (error) {
      handleError(error, config);
    } finally {
      consolePatcher.cleanup();
      if (isTelemetrySdkInitialized()) {
        await shutdownTelemetry(config);
      }
    }
  });
}
