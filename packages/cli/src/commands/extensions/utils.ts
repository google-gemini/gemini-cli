/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import {
  debugLogger,
  type ResolvedExtensionSetting,
} from '@google/gemini-cli-core';
import type { ExtensionConfig } from '../../config/extension.js';
import prompts from 'prompts';
import {
  promptForSetting,
  updateSetting,
  type ExtensionSetting,
  getScopedEnvContents,
  ExtensionSettingScope,
} from '../../config/extensions/extensionSettings.js';

export interface ConfigLogger {
  log(message: string): void;
  error(message: string): void;
}

export type RequestSettingCallback = (
  setting: ExtensionSetting,
) => Promise<string>;
export type RequestConfirmationCallback = (message: string) => Promise<boolean>;

const defaultLogger: ConfigLogger = {
  log: (message: string) => debugLogger.log(message),
  error: (message: string) => debugLogger.error(message),
};

const defaultRequestSetting: RequestSettingCallback = async (setting) =>
  promptForSetting(setting);

const defaultRequestConfirmation: RequestConfirmationCallback = async (
  message,
) => {
  const response = await prompts({
    type: 'confirm',
    name: 'confirm',
    message,
    initial: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return response.confirm;
};

export async function getExtensionManager() {
  const workspaceDir = process.cwd();
  const extensionManager = new ExtensionManager({
    workspaceDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    settings: loadSettings(workspaceDir).merged,
  });
  await extensionManager.loadExtensions();
  return extensionManager;
}

export async function getExtensionAndManager(
  extensionManager: ExtensionManager,
  name: string,
  logger: ConfigLogger = defaultLogger,
) {
  const extension = extensionManager
    .getExtensions()
    .find((ext) => ext.name === name);

  if (!extension) {
    logger.error(`Extension "${name}" is not installed.`);
    return { extension: null };
  }

  return { extension };
}

export async function configureSpecificSetting(
  extensionManager: ExtensionManager,
  extensionName: string,
  settingKey: string,
  scope: ExtensionSettingScope,
  logger: ConfigLogger = defaultLogger,
  requestSetting: RequestSettingCallback = defaultRequestSetting,
) {
  const { extension } = await getExtensionAndManager(
    extensionManager,
    extensionName,
    logger,
  );
  if (!extension) {
    return;
  }
  const extensionConfig = await extensionManager.loadExtensionConfig(
    extension.path,
  );
  if (!extensionConfig) {
    logger.error(
      `Could not find configuration for extension "${extensionName}".`,
    );
    return;
  }

  await updateSetting(
    extensionConfig,
    extension.id,
    settingKey,
    requestSetting,
    scope,
    process.cwd(),
  );

  logger.log(`Setting "${settingKey}" updated.`);
}

export async function configureExtension(
  extensionManager: ExtensionManager,
  extensionName: string,
  scope: ExtensionSettingScope,
  logger: ConfigLogger = defaultLogger,
  requestSetting: RequestSettingCallback = defaultRequestSetting,
  requestConfirmation: RequestConfirmationCallback = defaultRequestConfirmation,
) {
  const { extension } = await getExtensionAndManager(
    extensionManager,
    extensionName,
    logger,
  );
  if (!extension) {
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
    logger.log(`Extension "${extensionName}" has no settings to configure.`);
    return;
  }

  logger.log(`Configuring settings for "${extensionName}"...`);
  await configureExtensionSettings(
    extensionConfig,
    extension.id,
    scope,
    logger,
    requestSetting,
    requestConfirmation,
  );
}

export async function configureAllExtensions(
  extensionManager: ExtensionManager,
  scope: ExtensionSettingScope,
  logger: ConfigLogger = defaultLogger,
  requestSetting: RequestSettingCallback = defaultRequestSetting,
  requestConfirmation: RequestConfirmationCallback = defaultRequestConfirmation,
) {
  const extensions = extensionManager.getExtensions();

  if (extensions.length === 0) {
    logger.log('No extensions installed.');
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
      logger.log(`\nConfiguring settings for "${extension.name}"...`);
      await configureExtensionSettings(
        extensionConfig,
        extension.id,
        scope,
        logger,
        requestSetting,
        requestConfirmation,
      );
    }
  }
}

export async function configureExtensionSettings(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  scope: ExtensionSettingScope,
  logger: ConfigLogger = defaultLogger,
  requestSetting: RequestSettingCallback = defaultRequestSetting,
  requestConfirmation: RequestConfirmationCallback = defaultRequestConfirmation,
) {
  const currentScopedSettings = await getScopedEnvContents(
    extensionConfig,
    extensionId,
    scope,
    process.cwd(),
  );

  let workspaceSettings: Record<string, string> = {};
  if (scope === ExtensionSettingScope.USER) {
    workspaceSettings = await getScopedEnvContents(
      extensionConfig,
      extensionId,
      ExtensionSettingScope.WORKSPACE,
      process.cwd(),
    );
  }

  if (!extensionConfig.settings) return;

  for (const setting of extensionConfig.settings) {
    const currentValue = currentScopedSettings[setting.envVar];
    const workspaceValue = workspaceSettings[setting.envVar];

    if (workspaceValue !== undefined) {
      logger.log(
        `Note: Setting "${setting.name}" is already configured in the workspace scope.`,
      );
    }

    if (currentValue !== undefined) {
      const confirmed = await requestConfirmation(
        `Setting "${setting.name}" (${setting.envVar}) is already set. Overwrite?`,
      );

      if (!confirmed) {
        continue;
      }
    }

    await updateSetting(
      extensionConfig,
      extensionId,
      setting.envVar,
      requestSetting,
      scope,
      process.cwd(),
    );
  }
}

export function getFormattedSettingValue(
  setting: ResolvedExtensionSetting,
): string {
  if (!setting.value) {
    return '[not set]';
  }
  if (setting.sensitive) {
    return '***';
  }
  return setting.value;
}
