/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { disableSkill } from '../../utils/skillSettings.js';
import { renderSkillActionFeedback } from '../../utils/skillUtils.js';
import chalk from 'chalk';
import { z } from 'zod';

const disableArgsSchema = z.object({
  name: z.string(),
  scope: z.enum(['user', 'workspace']).default('workspace'),
});

interface DisableArgs {
  name: string;
  scope: SettingScope;
}

export async function handleDisable(args: DisableArgs) {
  const { name, scope } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const result = disableSkill(settings, name, scope);
  const feedback = renderSkillActionFeedback(
    result,
    (label, path) => `${chalk.bold(label)} (${chalk.dim(path)})`,
  );
  debugLogger.log(feedback);
}

export const disableCommand: CommandModule = {
  command: 'disable <name> [--scope]',
  describe: 'Disables an agent skill.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the skill to disable.',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        alias: 's',
        describe: 'The scope to disable the skill in (user or workspace).',
        type: 'string',
        default: 'workspace',
        choices: ['user', 'workspace'],
      }),
  handler: async (argv) => {
    const parsedArgs = disableArgsSchema.parse(argv);
    const scope =
      parsedArgs.scope === 'workspace'
        ? SettingScope.Workspace
        : SettingScope.User;
    await handleDisable({
      name: parsedArgs.name,
      scope,
    });
    await exitCli();
  },
};
