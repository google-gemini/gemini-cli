/**
 * @license
 * Copyright 2025 Google LLC
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

interface DisableArgs {
  name: string;
  scope: LoadableSettingScope;
}

export async function handleDisable(args: DisableArgs) {
  const { name, scope } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const currentDisabled =
    settings.forScope(scope).settings.skills?.disabled || [];

  if (currentDisabled.includes(name)) {
    debugLogger.log(`Skill "${name}" is already disabled in scope "${scope}".`);
    return;
  }

  const newDisabled = [...currentDisabled, name];
  settings.setValue(scope, 'skills.disabled', newDisabled);
  debugLogger.log(`Skill "${name}" successfully disabled in scope "${scope}".`);
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
        default: 'user',
        choices: ['user', 'project'],
      }),
  handler: async (argv) => {
    const scope: LoadableSettingScope =
      argv['scope'] === 'project' ? SettingScope.Workspace : SettingScope.User;
    await handleDisable({
      name: argv['name'] as string,
      scope,
    });
    await exitCli();
  },
};
