/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

async function removeAllowedTool(
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

  if (!allowed.includes(tool)) {
    debugLogger.warn(`Tool "${tool}" is not found in ${scope} allowed list.`);
    return true;
  }

  const newAllowed = allowed.filter((t) => t !== tool);

  settings.setValue(settingsScope, 'tools.allowed', newAllowed);

  debugLogger.log(
    `Tool "${tool}" removed from allowed list in ${scope} settings.`,
  );
  return true;
}

export const removeCommand: CommandModule = {
  command: 'remove <tool>',
  describe: 'Remove a tool from the allowed list',
  builder: (yargs) =>
    yargs
      .usage('Usage: gemini allow remove [options] <tool>')
      .positional('tool', {
        describe: 'Tool pattern to remove',
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
    const success = await removeAllowedTool(argv['tool'] as string, {
      scope: argv['scope'] as string,
    });
    await exitCli(success ? 0 : 1);
  },
};
