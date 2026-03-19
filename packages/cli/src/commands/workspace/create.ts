/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, ArgumentsCamelCase } from 'yargs';
import {
  createWorkspace as performCreateWorkspace,
  type Config,
} from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

interface CreateArgs {
  config?: Config;
  name: string;
  machineType?: string;
}

export async function createWorkspace(
  args: ArgumentsCamelCase<CreateArgs>,
): Promise<void> {
  if (!args.config) {
    // eslint-disable-next-line no-console
    console.error(chalk.red('Internal error: Config not loaded.'));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    chalk.yellow(`Requesting creation of workspace "${args.name}"...`),
  );

  const result = await performCreateWorkspace(
    args.config,
    args.name,
    args.machineType,
  );

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

export const createCommand: CommandModule<object, CreateArgs> = {
  command: 'create <name>',
  describe: 'Create a new remote workspace',
  builder: (yargs) => yargs
      .positional('name', {
        type: 'string',
        describe: 'Name of the workspace',
        demandOption: true,
      })
      .option('machine-type', {
        type: 'string',
        describe: 'GCE machine type',
      }),
  handler: async (argv) => {
    await createWorkspace(argv);
    await exitCli();
  },
};
