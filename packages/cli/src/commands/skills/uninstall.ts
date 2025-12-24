/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger, Storage } from '@google/gemini-cli-core';
import {
  loadSettings,
  SettingScope,
  type LoadableSettingScope,
} from '../../config/settings.js';
import { exitCli } from '../utils.js';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

interface UninstallArgs {
  names: string[];
  scope: LoadableSettingScope;
}

export async function handleUninstall(args: UninstallArgs) {
  const { names, scope } = args;
  const workspaceDir = process.cwd();
  const settings = loadSettings(workspaceDir);

  const destinationBase =
    scope === SettingScope.Workspace
      ? new Storage(workspaceDir).getProjectSkillsDir()
      : Storage.getUserSkillsDir();

  const errors: Array<{ name: string; error: string }> = [];
  for (const name of [...new Set(names)]) {
    try {
      const destinationPath = path.join(destinationBase, name);
      if (!existsSync(destinationPath)) {
        throw new Error(`Skill "${name}" not found at ${destinationPath}.`);
      }

      await rm(destinationPath, { recursive: true, force: true });

      // Also remove from disabled list if it exists
      const currentDisabled =
        settings.forScope(scope).settings.skills?.disabled || [];
      if (currentDisabled.includes(name)) {
        const newDisabled = currentDisabled.filter((d) => d !== name);
        settings.setValue(scope, 'skills.disabled', newDisabled);
      }

      debugLogger.log(
        `Skill "${name}" successfully uninstalled from scope "${scope}".`,
      );
    } catch (error) {
      errors.push({ name, error: getErrorMessage(error) });
    }
  }

  if (errors.length > 0) {
    for (const { name, error } of errors) {
      debugLogger.error(`Failed to uninstall "${name}": ${error}`);
    }
    process.exit(1);
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall <names..>',
  describe: 'Uninstalls one or more agent skills.',
  builder: (yargs) =>
    yargs
      .positional('names', {
        describe: 'The name(s) of the skill(s) to uninstall.',
        type: 'string',
        array: true,
      })
      .option('scope', {
        alias: 's',
        describe: 'The scope to uninstall the skill from (user or project).',
        type: 'string',
        default: 'user',
        choices: ['user', 'project'],
      })
      .check((argv) => {
        if (!argv.names || argv.names.length === 0) {
          throw new Error('The names argument must be provided.');
        }
        return true;
      }),
  handler: async (argv) => {
    const scope: LoadableSettingScope =
      argv['scope'] === 'project' ? SettingScope.Workspace : SettingScope.User;
    await handleUninstall({
      names: argv['names'] as string[],
      scope,
    });
    await exitCli();
  },
};
