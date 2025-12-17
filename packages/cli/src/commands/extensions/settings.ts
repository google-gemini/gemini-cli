/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  updateSetting,
  promptForSetting,
  ExtensionSettingScope,
  getScopedEnvContents,
} from '../../config/extensions/extensionSettings.js';
import { getExtensionAndManager } from './utils.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

// --- SET COMMAND ---
interface SetArgs {
  name: string;
  setting: string;
  scope: string;
}

const setCommand: CommandModule<object, SetArgs> = {
  command: 'set [--scope] <name> <setting>',
  describe: 'Set a specific setting for an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'Name of the extension to configure.',
        type: 'string',
        demandOption: true,
      })
      .positional('setting', {
        describe: 'The setting to configure (name or env var).',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        describe: 'The scope to set the setting in.',
        type: 'string',
        choices: ['user', 'workspace'],
        default: 'user',
      }),
  handler: async (args) => {
    const { name, setting, scope } = args;
    const { extension, extensionManager } = await getExtensionAndManager(name);
    if (!extension || !extensionManager) {
      return;
    }
    const extensionConfig = await extensionManager.loadExtensionConfig(
      extension.path,
    );
    if (!extensionConfig) {
      debugLogger.error(
        `Could not find configuration for extension "${name}".`,
      );
      return;
    }
    await updateSetting(
      extensionConfig,
      extension.id,
      setting,
      promptForSetting,
      scope as ExtensionSettingScope,
    );
    await exitCli();
  },
};

// --- LIST COMMAND ---
interface ListArgs {
  name: string;
}

const listCommand: CommandModule<object, ListArgs> = {
  command: 'list <name>',
  describe: 'List all settings for an extension.',
  builder: (yargs) =>
    yargs.positional('name', {
      describe: 'Name of the extension.',
      type: 'string',
      demandOption: true,
    }),
  handler: async (args) => {
    const { name } = args;
    const { extension, extensionManager } = await getExtensionAndManager(name);
    if (!extension || !extensionManager) {
      return;
    }
    const extensionConfig = await extensionManager.loadExtensionConfig(
      extension.path,
    );
    if (
      !extensionConfig ||
      !extensionConfig.settings ||
      extensionConfig.settings.length === 0
    ) {
      debugLogger.log(`Extension "${name}" has no settings to configure.`);
      return;
    }

    const userSettings = await getScopedEnvContents(
      extensionConfig,
      extension.id,
      ExtensionSettingScope.USER,
    );
    const workspaceSettings = await getScopedEnvContents(
      extensionConfig,
      extension.id,
      ExtensionSettingScope.WORKSPACE,
    );
    const mergedSettings = { ...userSettings, ...workspaceSettings };

    debugLogger.log(`Settings for "${name}":`);
    for (const setting of extensionConfig.settings) {
      const value = mergedSettings[setting.envVar];
      let displayValue: string;
      let scopeInfo = '';

      if (workspaceSettings[setting.envVar] !== undefined) {
        scopeInfo = ' (workspace)';
      } else if (userSettings[setting.envVar] !== undefined) {
        scopeInfo = ' (user)';
      }

      if (value === undefined) {
        displayValue = '[not set]';
      } else if (setting.sensitive) {
        displayValue = '[value stored in keychain]';
      } else {
        displayValue = value;
      }
      debugLogger.log(`
- ${setting.name} (${setting.envVar})`);
      debugLogger.log(`  Description: ${setting.description}`);
      debugLogger.log(`  Value: ${displayValue}${scopeInfo}`);
    }
    await exitCli();
  },
};

// --- SETTINGS COMMAND ---
export const settingsCommand: CommandModule = {
  command: 'settings <command>',
  describe: 'Manage extension settings.',
  builder: (yargs) =>
    yargs
      .command(setCommand)
      .command(listCommand)
      .demandCommand(1, 'You need to specify a command (set or list).')
      .version(false),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
