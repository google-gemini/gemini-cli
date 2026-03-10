/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { listCommand } from './profiles/list.js';
import { enableCommand } from './profiles/enable.js';
import { disableCommand } from './profiles/disable.js';
import { uninstallCommand } from './profiles/uninstall.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const profilesCommand: CommandModule = {
  command: 'profiles <command>',
  aliases: ['profile'],
  describe: 'Manage Gemini CLI profiles.',
  builder: (yargs) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(listCommand)
      .command(enableCommand)
      .command(disableCommand)
      .command(uninstallCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
