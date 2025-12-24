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

interface EnableArgs {
  name: string;
  scope: LoadableSettingScope;
}

export async function handleEnable(args: EnableArgs) {
  const { name, scope } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const currentDisabled =
    settings.forScope(scope).settings.skills?.disabled || [];
  const newDisabled = currentDisabled.filter((d) => d !== name);

  if (currentDisabled.length === newDisabled.length) {
    debugLogger.log(`Skill "${name}" is already enabled in scope "${scope}".`);
    return;
  }

  settings.setValue(scope, 'skills.disabled', newDisabled);
  debugLogger.log(`Skill "${name}" successfully enabled in scope "${scope}".`);
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
