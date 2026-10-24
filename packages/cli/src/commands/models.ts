/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { defer } from '../deferred.js';
import { listCommand } from './models/list.js';

export const modelsCommand: CommandModule = {
  command: 'models [command]',
  describe: 'Manage or list Gemini models.',
  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(defer(listCommand, 'models'))
      .version(false),
  handler: () => {
    // When no subcommand is provided, yargs invokes the default subcommand ($0)
    // defined in listCommand.
  },
};
