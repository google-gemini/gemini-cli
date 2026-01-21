/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

import { ExtensionStorage } from './storage.js';
import type { ExtensionConfig } from '../extension.js';

import prompts from 'prompts';
import { debugLogger, KeychainTokenStorage } from '@google/gemini-cli-core';
import { EXTENSION_SETTINGS_FILENAME } from './variables.js';

export enum ExtensionSettingScope {
  USER = 'user',
  WORKSPACE = 'workspace',
}

export interface ExtensionSetting {
  name: string;
  description: string;
  envVar: string;
  // NOTE: If no value is set, this setting will be considered NOT sensitive.
  sensitive?: boolean;
}

const getKeychainStorageName = (
  extensionName: string,
  extensionId: string,
  scope: ExtensionSettingScope,
  workspaceDir?: string,
): string => {
  const base = `Gemini CLI Extensions ${extensionName} ${extensionId}`;
  if (scope === ExtensionSettingScope.WORKSPACE) {
    if (!workspaceDir) {
      throw new Error('Workspace directory is required for workspace scope');
    }
    return `${base} ${workspaceDir}`;
  }
  return base;
};

export const getEnvFilePath = (
  extensionName: string,
  scope: ExtensionSettingScope,
  workspaceDir?: string,
): string => {
  if (scope === ExtensionSettingScope.WORKSPACE) {
    if (!workspaceDir) {
      throw new Error('Workspace directory is required for workspace scope');
    }
    return path.join(workspaceDir, EXTENSION_SETTINGS_FILENAME);
  }
  return new ExtensionStorage(extensionName).getEnvFilePath();
};

export async function maybePromptForSettings(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  requestSetting: (setting: ExtensionSetting) => Promise<string>,
  previousExtensionConfig?: ExtensionConfig,
  previousSettings?: Record<string, string>,
): Promise<void> {
  const { name: extensionName, settings } = extensionConfig;
  if (
    (!settings || settings.length === 0) &&
    (!previousExtensionConfig?.settings ||
      previousExtensionConfig.settings.length === 0)
  ) {
    return;
  }
  // We assume user scope here because we don't have a way to ask the user for scope during the initial setup.
  // The user can change the scope later using the `settings set` command.
  const scope = ExtensionSettingScope.USER;
  const envFilePath = getEnvFilePath(extensionName, scope);
  const keychain = new KeychainTokenStorage(
    getKeychainStorageName(extensionName, extensionId, scope),
  );

  if (!settings || settings.length === 0) {
    await clearSettings(envFilePath, keychain);
    return;
  }

  const settingsChanges = getSettingsChanges(
    settings,
    previousExtensionConfig?.settings ?? [],
  );

  const allSettings: Record<string, string> = { ...previousSettings };

  for (const removedEnvSetting of settingsChanges.removeEnv) {
    delete allSettings[removedEnvSetting.envVar];
  }

  for (const removedSensitiveSetting of settingsChanges.removeSensitive) {
    await keychain.deleteSecret(removedSensitiveSetting.envVar);
  }

  for (const setting of settingsChanges.promptForSensitive.concat(
    settingsChanges.promptForEnv,
  )) {
    const answer = await requestSetting(setting);
    allSettings[setting.envVar] = answer;
  }

  const nonSensitiveSettings: Record<string, string> = {};
  for (const setting of settings) {
    const value = allSettings[setting.envVar];
    if (value === undefined) {
      continue;
    }
    if (setting.sensitive) {
      await keychain.setSecret(setting.envVar, value);
    } else {
      nonSensitiveSettings[setting.envVar] = value;
    }
  }

  const envContent = formatEnvContent(nonSensitiveSettings);

  await fs.writeFile(envFilePath, envContent);
}

function formatEnvContent(settings: Record<string, string>): string {
  let envContent = '';
  for (const [key, value] of Object.entries(settings)) {
    const formattedValue = value.includes(' ') ? `"${value}"` : value;
    envContent += `${key}=${formattedValue}\n`;
  }
  return envContent;
}

export async function promptForSetting(
  setting: ExtensionSetting,
): Promise<string> {
  const response = await prompts({
    type: setting.sensitive ? 'password' : 'text',
    name: 'value',
    message: `${setting.name}\n${setting.description}`,
  });
  return response.value;
}

export async function getScopedEnvContents(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  scope: ExtensionSettingScope,
  workspaceDir?: string,
): Promise<Record<string, string>> {
  const { name: extensionName } = extensionConfig;
  const keychain = new KeychainTokenStorage(
    getKeychainStorageName(extensionName, extensionId, scope, workspaceDir),
  );
  const envFilePath = getEnvFilePath(extensionName, scope, workspaceDir);
  let customEnv: Record<string, string> = {};
  if (fsSync.existsSync(envFilePath)) {
    const envFile = fsSync.readFileSync(envFilePath, 'utf-8');
    customEnv = dotenv.parse(envFile);
  }

  if (extensionConfig.settings) {
    for (const setting of extensionConfig.settings) {
      if (setting.sensitive) {
        const secret = await keychain.getSecret(setting.envVar);
        if (secret) {
          customEnv[setting.envVar] = secret;
        }
      }
    }
  }
  return customEnv;
}

export async function getEnvContents(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  workspaceDir: string,
): Promise<Record<string, string>> {
  if (!extensionConfig.settings || extensionConfig.settings.length === 0) {
    return Promise.resolve({});
  }

  const userSettings = await getScopedEnvContents(
    extensionConfig,
    extensionId,
    ExtensionSettingScope.USER,
  );
  const workspaceSettings = await getScopedEnvContents(
    extensionConfig,
    extensionId,
    ExtensionSettingScope.WORKSPACE,
    workspaceDir,
  );

  return { ...userSettings, ...workspaceSettings };
}

export async function updateSetting(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  settingKey: string,
  requestSetting: (setting: ExtensionSetting) => Promise<string>,
  scope: ExtensionSettingScope,
  workspaceDir?: string,
): Promise<void> {
  const { name: extensionName, settings } = extensionConfig;
  if (!settings || settings.length === 0) {
    debugLogger.log('This extension does not have any settings.');
    return;
  }

  const settingToUpdate = settings.find(
    (s) => s.name === settingKey || s.envVar === settingKey,
  );

  if (!settingToUpdate) {
    debugLogger.log(`Setting ${settingKey} not found.`);
    return;
  }

  const newValue = await requestSetting(settingToUpdate);
  const keychain = new KeychainTokenStorage(
    getKeychainStorageName(extensionName, extensionId, scope, workspaceDir),
  );

  if (settingToUpdate.sensitive) {
    await keychain.setSecret(settingToUpdate.envVar, newValue);
    return;
  }

  // For non-sensitive settings, we need to read the existing .env file,
  // update the value, and write it back, preserving any other values.
  const envFilePath = getEnvFilePath(extensionName, scope, workspaceDir);
  let envContent = '';
  if (fsSync.existsSync(envFilePath)) {
    envContent = await fs.readFile(envFilePath, 'utf-8');
  }

  const parsedEnv = dotenv.parse(envContent);
  parsedEnv[settingToUpdate.envVar] = newValue;

  // We only want to write back the variables that are not sensitive.
  const nonSensitiveSettings: Record<string, string> = {};
  const sensitiveEnvVars = new Set(
    settings.filter((s) => s.sensitive).map((s) => s.envVar),
  );
  for (const [key, value] of Object.entries(parsedEnv)) {
    if (!sensitiveEnvVars.has(key)) {
      nonSensitiveSettings[key] = value;
    }
  }

  const newEnvContent = formatEnvContent(nonSensitiveSettings);
  await fs.writeFile(envFilePath, newEnvContent);
}

interface settingsChanges {
  promptForSensitive: ExtensionSetting[];
  removeSensitive: ExtensionSetting[];
  promptForEnv: ExtensionSetting[];
  removeEnv: ExtensionSetting[];
}
function getSettingsChanges(
  settings: ExtensionSetting[],
  oldSettings: ExtensionSetting[],
): settingsChanges {
  const isSameSetting = (a: ExtensionSetting, b: ExtensionSetting) =>
    a.envVar === b.envVar && (a.sensitive ?? false) === (b.sensitive ?? false);

  const sensitiveOld = oldSettings.filter((s) => s.sensitive ?? false);
  const sensitiveNew = settings.filter((s) => s.sensitive ?? false);
  const envOld = oldSettings.filter((s) => !(s.sensitive ?? false));
  const envNew = settings.filter((s) => !(s.sensitive ?? false));

  return {
    promptForSensitive: sensitiveNew.filter(
      (s) => !sensitiveOld.some((old) => isSameSetting(s, old)),
    ),
    removeSensitive: sensitiveOld.filter(
      (s) => !sensitiveNew.some((neu) => isSameSetting(s, neu)),
    ),
    promptForEnv: envNew.filter(
      (s) => !envOld.some((old) => isSameSetting(s, old)),
    ),
    removeEnv: envOld.filter(
      (s) => !envNew.some((neu) => isSameSetting(s, neu)),
    ),
  };
}

async function clearSettings(
  envFilePath: string,
  keychain: KeychainTokenStorage,
) {
  if (fsSync.existsSync(envFilePath)) {
    await fs.writeFile(envFilePath, '');
  }
  if (!(await keychain.isAvailable())) {
    return;
  }
  const secrets = await keychain.listSecrets();
  for (const secret of secrets) {
    await keychain.deleteSecret(secret);
  }
  return;
}

export async function getMissingSettings(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  workspaceDir: string,
): Promise<ExtensionSetting[]> {
  const { settings } = extensionConfig;
  if (!settings || settings.length === 0) {
    return [];
  }

  const existingSettings = await getEnvContents(
    extensionConfig,
    extensionId,
    workspaceDir,
  );
  const missingSettings: ExtensionSetting[] = [];

  for (const setting of settings) {
    if (existingSettings[setting.envVar] === undefined) {
      missingSettings.push(setting);
    }
  }

  return missingSettings;
}
