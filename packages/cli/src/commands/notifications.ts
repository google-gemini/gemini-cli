/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { setupCommand } from './notifications/setup.js';
import { testCommand } from './notifications/test.js';
import { disableCommand } from './notifications/disable.js';
import { statusCommand } from './notifications/status.js';

export const notificationsCommand: CommandModule = {
  command: 'notifications',
  describe: 'Manage audio notification settings',
  builder: (yargs: Argv) =>
    yargs
      .command(setupCommand)
      .command(testCommand)
      .command(disableCommand)
      .command(statusCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
