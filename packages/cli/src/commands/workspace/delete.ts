/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, ArgumentsCamelCase } from 'yargs';
import {
  deleteWorkspace as performDeleteWorkspace,
  type Config,
} from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

interface DeleteArgs {
  config?: Config;
  id: string;
}

export async function deleteWorkspace(
  args: ArgumentsCamelCase<DeleteArgs>,
): Promise<void> {
  if (!args.config) {
    // eslint-disable-next-line no-console
    console.error(chalk.red('Internal error: Config not loaded.'));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(chalk.yellow(`Deleting workspace "${args.id}"...`));

  const result = await performDeleteWorkspace(args.config, args.id);

  if (result.type === 'message') {
    if (result.messageType === 'error') {
      // eslint-disable-next-line no-console
      console.error(chalk.red(result.content));
    } else {
      // eslint-disable-next-line no-console
      console.log(chalk.green(result.content));
    }
  }
}

export const deleteCommand: CommandModule<object, DeleteArgs> = {
  command: 'delete <id>',
  describe: 'Delete a remote workspace',
  builder: (yargs) => yargs.positional('id', {
      type: 'string',
      describe: 'ID of the workspace to delete',
      demandOption: true,
    }),
  handler: async (argv) => {
    await deleteWorkspace(argv);
    await exitCli();
  },
};
