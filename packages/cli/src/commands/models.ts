/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { listCommand } from './models/list.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { defer } from '../deferred.js';

export const modelsCommand: CommandModule = {
  command: 'models <command>',
  describe: 'Inspect available models.',
  builder: (yargs) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(defer(listCommand, 'models'))
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
