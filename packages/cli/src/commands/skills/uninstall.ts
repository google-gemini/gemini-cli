/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { debugLogger } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { exitCli } from '../utils.js';
import { uninstallSkill } from '../../utils/skillUtils.js';
import chalk from 'chalk';

interface UninstallArgs {
  name: string;
  scope?: 'user' | 'workspace';
}

export async function handleUninstall(args: UninstallArgs) {
  try {
    const { name } = args;
    const scope = args.scope ?? 'user';

    const result = await uninstallSkill(name, scope);

    if (result) {
      debugLogger.log(
        chalk.green(
          `Successfully uninstalled skill: ${chalk.bold(name)} (scope: ${scope}, location: ${result.location})`,
        ),
      );
    } else {
      debugLogger.error(
        `Skill "${name}" is not installed in the ${scope} scope.`,
      );
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    await exitCli(1);
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall <name> [--scope]',
  describe: 'Uninstalls an agent skill by name.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the skill to uninstall.',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        describe:
          'The scope to uninstall the skill from. Defaults to "user" (global).',
        choices: ['user', 'workspace'],
        default: 'user',
      })
      .check((argv) => {
        if (!argv.name) {
          throw new Error('The skill name must be provided.');
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUninstall({
      name: argv['name'] as string,
      scope: argv['scope'] as 'user' | 'workspace',
    });
    await exitCli();
  },
};
