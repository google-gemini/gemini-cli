/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { enableSkill } from '../../utils/skillSettings.js';
import { renderSkillActionFeedback } from '../../utils/skillUtils.js';
import chalk from 'chalk';

interface EnableArgs {
  name: string;
}

export async function handleEnable(args: EnableArgs) {
  const { name } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  if (settings.merged.admin?.skills?.enabled === false) {
    debugLogger.log(chalk.red('Agent skills are disabled by your admin.'));
    return;
  }

  const adminDisabledSkills =
    settings.merged.admin?.skills?.disabled?.map((n) => n.toLowerCase()) ?? [];
  if (adminDisabledSkills.includes(name.toLowerCase())) {
    debugLogger.log(
      chalk.red(`Skill "${chalk.bold(name)}" is disabled by your admin.`),
    );
    return;
  }

  const result = enableSkill(settings, name);
  const feedback = renderSkillActionFeedback(
    result,
    (label, path) => `${chalk.bold(label)} (${chalk.dim(path)})`,
  );
  debugLogger.log(feedback);
}

export const enableCommand: CommandModule = {
  command: 'enable <name>',
  describe: 'Enables an agent skill.',
  builder: (yargs) =>
    yargs.positional('name', {
      describe: 'The name of the skill to enable.',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    await handleEnable({
      name: argv['name'] as string,
    });
    await exitCli();
  },
};
