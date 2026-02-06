/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import type { ExtensionSettingScope } from '../../config/extensions/extensionSettings.js';
import {
  configureAllExtensions,
  configureExtension,
  configureSpecificSetting,
  getExtensionManager,
} from './utils.js';
import { loadSettings } from '../../config/settings.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

interface ConfigureArgs {
  name?: string;
  setting?: string;
  scope: string;
}

export const configureCommand: CommandModule<object, ConfigureArgs> = {
  command: 'config [name] [setting]',
  describe: 'Configure extension settings.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'Name of the extension to configure.',
        type: 'string',
      })
      .positional('setting', {
        describe: 'The specific setting to configure (name or env var).',
        type: 'string',
      })
      .option('scope', {
        describe: 'The scope to set the setting in.',
        type: 'string',
        choices: ['user', 'workspace'],
        default: 'user',
      }),
  handler: async (args) => {
    const { name, setting, scope } = args;
    const settings = loadSettings(process.cwd()).merged;

    if (!(settings.experimental?.extensionConfig ?? true)) {
      coreEvents.emitFeedback(
        'error',
        'Extension configuration is currently disabled. Enable it by setting "experimental.extensionConfig" to true.',
      );
      await exitCli();
      return;
    }

    if (name) {
      if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        debugLogger.error(
          'Invalid extension name. Names cannot contain path separators or "..".',
        );
        return;
      }
    }

    const extensionManager = await getExtensionManager();

    // Case 1: Configure specific setting for an extension
    if (name && setting) {
      await configureSpecificSetting(
        extensionManager,
        name,
        setting,
        scope as ExtensionSettingScope,
      );
    }
    // Case 2: Configure all settings for an extension
    else if (name) {
      await configureExtension(
        extensionManager,
        name,
        scope as ExtensionSettingScope,
      );
    }
    // Case 3: Configure all extensions
    else {
      await configureAllExtensions(
        extensionManager,
        scope as ExtensionSettingScope,
      );
    }

    await exitCli();
  },
};
