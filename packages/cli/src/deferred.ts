/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import {
  coreEvents,
  ExitCodes,
  getAdminErrorMessage,
} from '@google/gemini-cli-core';
import { runExitCleanup } from './utils/cleanup.js';
import type { MergedSettings } from './config/settings.js';
import process from 'node:process';

export interface DeferredCommand {
  handler: (argv: ArgumentsCamelCase) => void | Promise<void>;
  argv: ArgumentsCamelCase;
  commandName: string;
}

let deferredCommand: DeferredCommand | undefined;

export function setDeferredCommand(command: DeferredCommand) {
  deferredCommand = command;
}

export async function runDeferredCommand(settings: MergedSettings) {
  if (!deferredCommand) {
    return;
  }

  const adminSettings = settings.admin;
  const commandName = deferredCommand.commandName;

  if (commandName === 'mcp' && adminSettings?.mcp?.enabled === false) {
    coreEvents.emitFeedback(
      'error',
      getAdminErrorMessage('MCP', undefined /* config */),
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_CONFIG_ERROR);
  }

  if (
    commandName === 'extensions' &&
    adminSettings?.extensions?.enabled === false
  ) {
    coreEvents.emitFeedback(
      'error',
      getAdminErrorMessage('Extensions', undefined /* config */),
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_CONFIG_ERROR);
  }

  if (commandName === 'skills' && adminSettings?.skills?.enabled === false) {
    coreEvents.emitFeedback(
      'error',
      getAdminErrorMessage('Agent skills', undefined /* config */),
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_CONFIG_ERROR);
  }

  // Inject settings into argv
  const argvWithSettings = {
    ...deferredCommand.argv,
    settings,
  };

  await deferredCommand.handler(argvWithSettings);
  await runExitCleanup();
  process.exit(ExitCodes.SUCCESS);
}

/**
 * Wraps a command's handler to defer its execution.
 * It stores the handler and arguments in a singleton `deferredCommand` variable.
 */
export function defer<T = object, U = object>(
  commandModule: CommandModule<T, U>,
  parentCommandName?: string,
): CommandModule<T, U> {
  return {
    ...commandModule,
    handler: (argv: ArgumentsCamelCase<U>) => {
      setDeferredCommand({
        handler: commandModule.handler as (
          argv: ArgumentsCamelCase,
        ) => void | Promise<void>,
        argv: argv as unknown as ArgumentsCamelCase,
        commandName: parentCommandName || 'unknown',
      });
    },
  };
}
