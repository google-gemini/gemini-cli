/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp' command
import type { CommandModule, Argv } from 'yargs';
import { addCommand } from './mcp/add.js';
import { removeCommand } from './mcp/remove.js';
import { listCommand } from './mcp/list.js';
import { enableCommand, disableCommand } from './mcp/enableDisable.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { defer } from '../deferred.js';

export const mcpCommand: CommandModule = {
  command: 'mcp',
  describe: 'Manage MCP servers',
  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(defer(addCommand, 'mcp'))
      .command(defer(removeCommand, 'mcp'))
      .command(defer(listCommand, 'mcp'))
      .command(defer(enableCommand, 'mcp'))
      .command(defer(disableCommand, 'mcp'))
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
