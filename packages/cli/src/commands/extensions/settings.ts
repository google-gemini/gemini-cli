/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  getEnvContents,
  updateSetting,
  promptForSetting,
} from '../../config/extensions/extensionSettings.js';
import { getExtensionAndManager } from './utils.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

// --- SET COMMAND ---
interface SetArgs {
  name: string;
  setting: string;
}

const setCommand: CommandModule<object, SetArgs> = {
  command: 'set <name> <setting>',
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
      }),
  handler: async (args) => {
    const { name, setting } = args;
    const { extension, extensionManager } = await getExtensionAndManager(name);
    if (!extension || !extensionManager) {
      return;
    }
    const extensionConfig = extensionManager.loadExtensionConfig(
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
    const extensionConfig = extensionManager.loadExtensionConfig(
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

    const currentSettings = await getEnvContents(extensionConfig, extension.id);

    debugLogger.log(`Settings for "${name}":`);
    for (const setting of extensionConfig.settings) {
      const value = currentSettings[setting.envVar];
      let displayValue: string;
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
      debugLogger.log(`  Value: ${displayValue}`);
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
