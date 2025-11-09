/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as dotenv from 'dotenv';

import { ExtensionStorage } from './storage.js';
import type { ExtensionConfig } from '../extension.js';

import prompts from 'prompts';
import { KeychainTokenStorage } from '@google/gemini-cli-core';

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
): string => `Gemini CLI Extensions ${extensionName} ${extensionId}`;

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
  const envFilePath = new ExtensionStorage(extensionName).getEnvFilePath();
  const keychain = new KeychainTokenStorage(
    getKeychainStorageName(extensionName, extensionId),
  );

  if (!settings || settings.length === 0) {
    await clearSettings(envFilePath, keychain);
    return;
  }

  const settingsChanges = getSettingsChanges(
    settings,
    previousExtensionConfig?.settings ?? [],
  );

  const allSettings: Record<string, string> = { ...(previousSettings ?? {}) };

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

  let envContent = '';
  for (const [key, value] of Object.entries(nonSensitiveSettings)) {
    envContent += `${key}=${value}\n`;
  }

  await fs.writeFile(envFilePath, envContent);
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

export async function getEnvContents(
  extensionConfig: ExtensionConfig,
  extensionId: string,
): Promise<Record<string, string>> {
  if (!extensionConfig.settings || extensionConfig.settings.length === 0) {
    return Promise.resolve({});
  }
  const extensionStorage = new ExtensionStorage(extensionConfig.name);
  const keychain = new KeychainTokenStorage(
    getKeychainStorageName(extensionConfig.name, extensionId),
  );
  let customEnv: Record<string, string> = {};
  if (fsSync.existsSync(extensionStorage.getEnvFilePath())) {
    const envFile = fsSync.readFileSync(
      extensionStorage.getEnvFilePath(),
      'utf-8',
    );
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
  if (!keychain.isAvailable()) {
    return;
  }
  const secrets = await keychain.listSecrets();
  for (const secret of secrets) {
    await keychain.deleteSecret(secret);
  }
  return;
}
