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

export const extensionsCommand: CommandModule = {
  command: 'extensions <command>',
  describe: 'Manage Gemini CLI extensions.',
  builder: (yargs) =>
    yargs
      .command(installCommand)
      .command(uninstallCommand)
      .command(listCommand)
      .command(updateCommand)
      .command(disableCommand)
      .command(enableCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
