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
import prompts from 'prompts';
import type { ExtensionConfig } from '../../config/extension.js';

interface ConfigureArgs {
  name?: string;
  setting?: string;
  scope: string;
}

export const configureCommand: CommandModule<object, ConfigureArgs> = {
  command: 'configure [name] [setting]',
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
  // We need to get the extension manager differently here since we don't have a specific extension name yet.
  // We can reuse getExtensionAndManager with a dummy name or refactor,
  // but let's just create a new manager instance similar to getExtensionAndManager.
  // Actually, getExtensionAndManager is specific. Let's import the logic or just instantiate.
  // Since we need to iterate all extensions, we should refactor getExtensionAndManager or just copy basic instantiation.
  // Let's copy basic instantiation from utils.ts but without the find logic.

  const { ExtensionManager } = await import(
    '../../config/extension-manager.js'
  );
  const { requestConsentNonInteractive } = await import(
    '../../config/extensions/consent.js'
  );
  const { loadSettings } = await import('../../config/settings.js');

  const workspaceDir = process.cwd();
  const extensionManager = new ExtensionManager({
    workspaceDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    settings: loadSettings(workspaceDir).merged,
  });
  await extensionManager.loadExtensions();
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
  // We need current values in the target scope to know if we should prompt for overwrite.
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
