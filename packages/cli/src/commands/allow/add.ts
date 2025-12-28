/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

async function addAllowedTool(
  tool: string,
  options: {
    scope: string;
  },
): Promise<boolean> {
  const { scope } = options;

  const settings = loadSettings(process.cwd());
  const inHome = settings.workspace.path === settings.user.path;

  if (scope === 'project' && inHome) {
    debugLogger.error(
      'Error: Please use --scope user to edit settings in the home directory.',
    );
    return false;
  }

  const settingsScope =
    scope === 'user' ? SettingScope.User : SettingScope.Workspace;

  const existingSettings = settings.forScope(settingsScope).settings;
  const tools = existingSettings.tools || {};
  const allowed = tools.allowed || [];

  if (allowed.includes(tool)) {
    debugLogger.log(`Tool "${tool}" is already allowed in ${scope} settings.`);
    return true;
  }

  const newAllowed = [...allowed, tool];

  settings.setValue(settingsScope, 'tools.allowed', newAllowed);

  debugLogger.log(`Tool "${tool}" added to allowed list in ${scope} settings.`);
  return true;
}

export const addCommand: CommandModule = {
  command: 'add <tool>',
  describe: 'Add a tool to the allowed list',
  builder: (yargs) =>
    yargs
      .usage('Usage: gemini allow add [options] <tool>')
      .positional('tool', {
        describe: 'Tool pattern to allow (e.g. "run_shell_command(git)")',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        alias: 's',
        describe: 'Configuration scope (user or project)',
        type: 'string',
        default: 'project',
        choices: ['user', 'project'],
      }),
  handler: async (argv) => {
    const success = await addAllowedTool(argv['tool'] as string, {
      scope: argv['scope'] as string,
    });
    await exitCli(success ? 0 : 1);
  },
};
