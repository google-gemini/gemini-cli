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
import { linkCommand } from './skills/link.js';
import { uninstallCommand } from './skills/uninstall.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { defer } from '../deferred.js';

export const skillsCommand: CommandModule = {
  command: 'skills <command>',
  aliases: ['skill'],
  describe: 'Manage agent skills.',
  builder: (yargs) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(defer(listCommand, 'skills'))
      .command(defer(enableCommand, 'skills'))
      .command(defer(disableCommand, 'skills'))
      .command(defer(installCommand, 'skills'))
      .command(defer(linkCommand, 'skills'))
      .command(defer(uninstallCommand, 'skills'))
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
