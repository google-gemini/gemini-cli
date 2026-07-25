/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { defer } from '../deferred.js';
import { setupCommand } from './gemma/setup.js';
import { startCommand } from './gemma/start.js';
import { stopCommand } from './gemma/stop.js';
import { statusCommand } from './gemma/status.js';
import { logsCommand } from './gemma/logs.js';

export const gemmaCommand: CommandModule = {
  command: 'gemma',
  describe: 'Manage local Gemma model routing',
  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(defer(setupCommand, 'gemma'))
      .command(defer(startCommand, 'gemma'))
      .command(defer(stopCommand, 'gemma'))
      .command(defer(statusCommand, 'gemma'))
      .command(defer(logsCommand, 'gemma'))
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {},
};
