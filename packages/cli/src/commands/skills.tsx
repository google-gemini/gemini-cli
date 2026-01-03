/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { listCommand } from './skills/list.js';
import { enableCommand } from './skills/enable.js';
import { disableCommand } from './skills/disable.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const skillsCommand: CommandModule = {
  command: 'skills <command>',
  aliases: ['skill'],
  describe: 'Manage Gemini CLI agent skills.',
  builder: (yargs) =>
    yargs
      .middleware(() => initializeOutputListenersAndFlush())
      .command(listCommand)
      .command(enableCommand)
      .command(disableCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
