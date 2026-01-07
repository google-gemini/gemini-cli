/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  loadSettings,
  SettingScope,
  type LoadableSettingScope,
} from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { enableSkill } from '../../utils/skillSettings.js';
import { renderSkillActionFeedback } from '../../utils/skillUtils.js';

interface EnableArgs {
  name: string;
  scope: LoadableSettingScope;
}

export async function handleEnable(args: EnableArgs) {
  const { name, scope } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const result = enableSkill(settings, name, scope);
  debugLogger.log(renderSkillActionFeedback(result, (label, _path) => label));
}

export const enableCommand: CommandModule = {
  command: 'enable <name>',
  describe: 'Enables an agent skill.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the skill to enable.',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        alias: 's',
        describe: 'The scope to enable the skill in (user or project).',
        type: 'string',
        default: 'user',
        choices: ['user', 'project'],
      }),
  handler: async (argv) => {
    const scope: LoadableSettingScope =
      argv['scope'] === 'project' ? SettingScope.Workspace : SettingScope.User;
    await handleEnable({
      name: argv['name'] as string,
      scope,
    });
    await exitCli();
  },
};
