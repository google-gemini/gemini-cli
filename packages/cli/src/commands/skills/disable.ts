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

interface DisableArgs {
  name: string;
  scope: SettingScope;
}

export async function handleDisable(args: DisableArgs) {
  const { name, scope } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const result = disableSkill(settings, name, scope);
  let feedback = renderSkillActionFeedback(
    result,
    (label, path) => `${chalk.bold(label)} (${chalk.dim(path)})`,
  );
  if (result.status === 'success') {
    feedback += ' Restart required to take effect.';
  }
  debugLogger.log(feedback);
}

export const disableCommand: CommandModule = {
  command: 'disable <name>',
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
        describe: 'The scope to disable the skill in (user or project).',
        type: 'string',
        default: 'project',
        choices: ['user', 'project'],
      }),
  handler: async (argv) => {
    const scope =
      argv['scope'] === 'project' ? SettingScope.Workspace : SettingScope.User;
    await handleDisable({
      name: argv['name'] as string,
      scope,
    });
    await exitCli();
  },
};
