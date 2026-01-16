/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { installCommand } from './extensions/install.js';
import { uninstallCommand } from './extensions/uninstall.js';
import { listCommand } from './extensions/list.js';
import { updateCommand } from './extensions/update.js';
import { disableCommand } from './extensions/disable.js';
import { enableCommand } from './extensions/enable.js';
import { linkCommand } from './extensions/link.js';
import { newCommand } from './extensions/new.js';
import { validateCommand } from './extensions/validate.js';
import { configureCommand } from './extensions/configure.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const extensionsCommand: CommandModule = {
  command: 'extensions <command>',
  aliases: ['extension'],
  describe: 'Manage Gemini CLI extensions.',
  builder: (yargs) =>
    yargs
      .middleware(() => initializeOutputListenersAndFlush())
      .command(installCommand)
      .command(uninstallCommand)
      .command(listCommand)
      .command(updateCommand)
      .command(disableCommand)
      .command(enableCommand)
      .command(linkCommand)
      .command(newCommand)
      .command(validateCommand)
      .command(configureCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
