/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini extensions' commands
import type { CommandModule, Argv } from 'yargs';
import { installCommand } from './extensions/install.js';

export const extensionsCommand: CommandModule = {
  command: 'extensions',
  describe: 'Manage extensions',
  builder: (yargs: Argv) =>
    yargs
      .command(installCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
