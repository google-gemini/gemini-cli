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

export async function handleList() {
  try {
    const workspaceDir = process.cwd();
    const settings = loadSettings(workspaceDir);

    // Use loadCliConfig to get a fully initialized config with discovered skills
    const config = await loadCliConfig(
      settings.merged,
      'skills-list-session',
      {
        // We pass minimal CliArgs, enough for loadCliConfig
        debug: false,
      } as Partial<CliArgs> as CliArgs,
      workspaceDir,
    );

    // Initialize to trigger skill discovery
    await config.initialize();

    const skillManager = config.getSkillManager();
    const skills = skillManager.getAllSkills();

    if (skills.length === 0) {
      debugLogger.log('No skills discovered.');
      return;
    }

    debugLogger.log('Discovered Skills:');
    for (const skill of skills) {
      const status = skill.disabled ? '[Disabled]' : '[Enabled]';
      debugLogger.log(`- ${skill.name} ${status}`);
      debugLogger.log(`  Description: ${skill.description}`);
      debugLogger.log(`  Location: ${skill.location}`);
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
