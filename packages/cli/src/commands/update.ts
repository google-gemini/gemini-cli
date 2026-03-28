/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { exitCli } from './utils.js';
import { performUpdate } from '../utils/performUpdate.js';
import { debugLogger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import process from 'node:process';

async function runUpdate() {
  const projectRoot = process.cwd();

  debugLogger.log('Checking for updates...');

  const result = await performUpdate(projectRoot);

  switch (result.status) {
    case 'up-to-date':
      process.stdout.write(
        chalk.green(`\nGemini CLI is up to date. (${result.current})\n`),
      );
      break;

    case 'updated':
      process.stdout.write(
        chalk.green(
          `\nSuccessfully updated from ${result.from} to ${result.to}.\n`,
        ),
      );
      break;

    case 'unsupported':
      process.stdout.write(chalk.yellow(`\n${result.message}\n`));
      break;

    case 'error':
      process.stderr.write(chalk.red(`\nUpdate failed: ${result.message}\n`));
      await exitCli(1);
      return;
    default: {
      // Exhaustive check
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }

  await exitCli(0);
}

export const updateCommand: CommandModule = {
  command: 'update',
  describe: 'Check for updates and install if a newer version is available',
  builder: (yargs) => yargs.usage('Usage: gemini update').version(false),
  handler: async () => {
    await runUpdate();
  },
};
