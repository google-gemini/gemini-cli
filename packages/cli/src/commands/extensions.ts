/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { listCommand } from './extensions/list.js';
import { enableCommand } from './extensions/enable.js';
import { disableCommand } from './extensions/disable.js';

export const extensionsCommand: CommandModule = {
  command: 'extensions',
  describe: 'Manage extensions',
  builder: (yargs: Argv) =>
    yargs
      .command(listCommand)
      .command(enableCommand)
      .command(disableCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};
