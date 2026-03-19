/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini wsr' command
import type { CommandModule, Argv } from 'yargs';
import { listCommand } from './workspace/list.js';
import { createCommand } from './workspace/create.js';
import { deleteCommand } from './workspace/delete.js';
import { connectCommand } from './workspace/connect.js';
import { defer } from '../deferred.js';

export const remoteWorkspaceCommand: CommandModule = {
  command: 'wsr',
  describe: 'Manage remote workspaces',
  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        argv['isCommand'] = true;
      })
      .command(defer(listCommand, 'wsr'))
      .command(defer(createCommand, 'wsr'))
      .command(defer(deleteCommand, 'wsr'))
      .command(defer(connectCommand, 'wsr'))
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),

  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};
