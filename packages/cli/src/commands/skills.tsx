/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { listCommand } from './skills/list.js';
import { enableCommand } from './skills/enable.js';
import { disableCommand } from './skills/disable.js';
import { installCommand } from './skills/install.js';
import { uninstallCommand } from './skills/uninstall.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const skillsCommand: CommandModule = {
  command: 'skills <command>',
  aliases: ['skill'],
  describe: 'Manage agent skills.',
  builder: (yargs) =>
    yargs
      .middleware(() => initializeOutputListenersAndFlush())
      .command(listCommand)
      .command(enableCommand)
      .command(disableCommand)
      .command(installCommand)
      .command(uninstallCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
