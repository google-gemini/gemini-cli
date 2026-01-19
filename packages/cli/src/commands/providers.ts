/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini providers' command
import type { CommandModule, Argv } from 'yargs';
import { listCommand } from './providers/list.js';
import { modelsCommand } from './providers/models.js';
import { switchCommand } from './providers/switch.js';
import { authCommand } from './providers/auth.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const providersCommand: CommandModule = {
  command: 'providers',
  describe: 'Manage AI providers (multi-provider model selector)',
  builder: (yargs: Argv) =>
    yargs
      .middleware(() => initializeOutputListenersAndFlush())
      .command(listCommand)
      .command(modelsCommand)
      .command(switchCommand)
      .command(authCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
