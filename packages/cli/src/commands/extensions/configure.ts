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
import { getExtensionAndManager, getExtensionManager } from './utils.js';
import { loadSettings } from '../../config/settings.js';
import { debugLogger, coreEvents } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import prompts from 'prompts';
import type { ExtensionConfig } from '../../config/extension.js';
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

    // Case 1: Configure specific setting for an extension
    if (name && setting) {
      await configureSpecificSetting(
        name,
        setting,
        scope as ExtensionSettingScope,
      );
    }
    // Case 2: Configure all settings for an extension
    else if (name) {
      await configureExtension(name, scope as ExtensionSettingScope);
    }
    // Case 3: Configure all extensions
    else {
      await configureAllExtensions(scope as ExtensionSettingScope);
    }

    await exitCli();
  },
};

async function configureSpecificSetting(
  extensionName: string,
  settingKey: string,
  scope: ExtensionSettingScope,
) {
  const { extension, extensionManager } =
    await getExtensionAndManager(extensionName);
  if (!extension || !extensionManager) {
    return;
  }
  const extensionConfig = await extensionManager.loadExtensionConfig(
    extension.path,
  );
  if (!extensionConfig) {
    debugLogger.error(
      `Could not find configuration for extension "${extensionName}".`,
    );
    return;
  }

  await updateSetting(
    extensionConfig,
    extension.id,
    settingKey,
    promptForSetting,
    scope,
  );
}

async function configureExtension(
  extensionName: string,
  scope: ExtensionSettingScope,
) {
  const { extension, extensionManager } =
    await getExtensionAndManager(extensionName);
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
    debugLogger.log(
      `Extension "${extensionName}" has no settings to configure.`,
    );
    return;
  }

  debugLogger.log(`Configuring settings for "${extensionName}"...`);
  await configureExtensionSettings(extensionConfig, extension.id, scope);
}

async function configureAllExtensions(scope: ExtensionSettingScope) {
  const extensionManager = await getExtensionManager();
  const extensions = extensionManager.getExtensions();

  if (extensions.length === 0) {
    debugLogger.log('No extensions installed.');
    return;
  }

  for (const extension of extensions) {
    const extensionConfig = await extensionManager.loadExtensionConfig(
      extension.path,
    );
    if (
      extensionConfig &&
      extensionConfig.settings &&
      extensionConfig.settings.length > 0
    ) {
      debugLogger.log(`\nConfiguring settings for "${extension.name}"...`);
      await configureExtensionSettings(extensionConfig, extension.id, scope);
    }
  }
}

async function configureExtensionSettings(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  scope: ExtensionSettingScope,
) {
  const currentScopedSettings = await getScopedEnvContents(
    extensionConfig,
    extensionId,
    scope,
  );

  let workspaceSettings: Record<string, string> = {};
  if (scope === ExtensionSettingScope.USER) {
    workspaceSettings = await getScopedEnvContents(
      extensionConfig,
      extensionId,
      ExtensionSettingScope.WORKSPACE,
    );
  }

  if (!extensionConfig.settings) return;

  for (const setting of extensionConfig.settings) {
    const currentValue = currentScopedSettings[setting.envVar];
    const workspaceValue = workspaceSettings[setting.envVar];

    if (workspaceValue !== undefined) {
      debugLogger.log(
        `Note: Setting "${setting.name}" is already configured in the workspace scope.`,
      );
    }

    if (currentValue !== undefined) {
      const response = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Setting "${setting.name}" (${setting.envVar}) is already set. Overwrite?`,
        initial: false,
      });

      if (!response.overwrite) {
        continue;
      }
    }

    await updateSetting(
      extensionConfig,
      extensionId,
      setting.envVar,
      promptForSetting,
      scope,
    );
  }
}
