/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { ExtensionManager } from '../../config/extension-manager.js';
import {
  getEnvContents,
  updateSetting,
  promptForSetting,
} from '../../config/extensions/extensionSettings.js';
import { loadSettings } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';

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
    const workspaceDir = process.cwd();
    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent: requestConsentNonInteractive,
      requestSetting: promptForSetting,
      settings: loadSettings(workspaceDir).merged,
    });
    await extensionManager.loadExtensions();
    const extension = extensionManager
      .getExtensions()
      .find((ext) => ext.name === name);
    if (!extension) {
      console.error(`Extension "${name}" is not installed.`);
      return;
    }
    const extensionConfig = extensionManager.loadExtensionConfig(
      extension.path,
    );
    if (!extensionConfig) {
      console.error(`Could not find configuration for extension "${name}".`);
      return;
    }
    await updateSetting(
      extensionConfig,
      extension.id,
      setting,
      promptForSetting,
    );
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
    const workspaceDir = process.cwd();
    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent: requestConsentNonInteractive,
      requestSetting: promptForSetting,
      settings: loadSettings(workspaceDir).merged,
    });
    await extensionManager.loadExtensions();
    const extension = extensionManager
      .getExtensions()
      .find((ext) => ext.name === name);
    if (!extension) {
      console.error(`Extension "${name}" is not installed.`);
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
      console.log(`Extension "${name}" has no settings to configure.`);
      return;
    }

    const currentSettings = await getEnvContents(extensionConfig, extension.id);

    console.log(`Settings for "${name}":`);
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
      console.log(`
- ${setting.name} (${setting.envVar})`);
      console.log(`  Description: ${setting.description}`);
      console.log(`  Value: ${displayValue}`);
    }
  },
};

// --- CONFIGURE COMMAND ---
export const configureCommand: CommandModule = {
  command: 'configure <command>',
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
