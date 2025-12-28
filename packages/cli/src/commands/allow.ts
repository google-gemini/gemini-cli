/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { addCommand } from './allow/add.js';
import { removeCommand } from './allow/remove.js';
import { listCommand } from './allow/list.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const allowCommand: CommandModule = {
  command: 'allow',
  describe: 'Manage allowed tools (whitelist)',
  builder: (yargs: Argv) =>
    yargs
      .middleware(() => initializeOutputListenersAndFlush())
      .command(addCommand)
      .command(removeCommand)
      .command(listCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};
