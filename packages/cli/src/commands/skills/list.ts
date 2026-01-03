/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger } from '@google/gemini-cli-core';
import { loadSettings } from '../../config/settings.js';
import { loadCliConfig, type CliArgs } from '../../config/config.js';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

export async function handleList() {
  try {
    const workspaceDir = process.cwd();
    const settings = loadSettings(workspaceDir);

    const config = await loadCliConfig(
      settings.merged,
      'skills-list-session',
      {
        debug: false,
      } as Partial<CliArgs> as CliArgs,
      { cwd: workspaceDir },
    );

    // Initialize to trigger extension loading and skill discovery
    await config.initialize();

    const skillManager = config.getSkillManager();
    const skills = skillManager.getAllSkills();

    if (skills.length === 0) {
      debugLogger.log('No skills discovered.');
      return;
    }

    debugLogger.log(chalk.bold('Discovered Agent Skills:'));
    debugLogger.log('');

    for (const skill of skills) {
      const status = skill.disabled
        ? chalk.red('[Disabled]')
        : chalk.green('[Enabled]');

      debugLogger.log(`${chalk.bold(skill.name)} ${status}`);
      debugLogger.log(`  Description: ${skill.description}`);
      debugLogger.log(`  Location:    ${skill.location}`);
      debugLogger.log('');
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'Lists discovered agent skills.',
  builder: (yargs) => yargs,
  handler: async () => {
    await handleList();
    await exitCli();
  },
};
