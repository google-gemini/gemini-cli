/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, ArgumentsCamelCase } from 'yargs';
import {
  listWorkspaces as performListWorkspaces,
  type Config,
} from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

interface ListArgs {
  config?: Config;
}

export async function listWorkspaces(
  args: ArgumentsCamelCase<ListArgs>,
): Promise<void> {
  if (!args.config) {
    // eslint-disable-next-line no-console
    console.error(chalk.red('Internal error: Config not loaded.'));
    return;
  }

  const result = await performListWorkspaces(args.config);

  if (result.type === 'message') {
    if (result.messageType === 'error') {
      // eslint-disable-next-line no-console
      console.error(chalk.red(result.content));
    } else {
      // eslint-disable-next-line no-console
      console.log(result.content);
    }
  }
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: 'list',
  describe: 'List all remote workspaces',
  handler: async (argv) => {
    await listWorkspaces(argv);
    await exitCli();
  },
};
