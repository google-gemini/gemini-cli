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
  sensitive?: boolean;
}

export async function maybePromptForSettings(
  extensionConfig: ExtensionConfig,
  extensionId: string,
  requestSetting: (setting: ExtensionSetting) => Promise<string>,
  previousExtensionConfig?: ExtensionConfig,
  previousSettings?: Record<string, string>,
): Promise<void> {
  const { name: extensionName, settings } = extensionConfig;
  const envFilePath = new ExtensionStorage(extensionName).getEnvFilePath();
  const keychain = new KeychainTokenStorage(extensionId);

  if (!settings || settings.length === 0) {
    // No settings for this extension. Clear any existing .env file.
    if (fsSync.existsSync(envFilePath)) {
      await fs.writeFile(envFilePath, '');
    }
    // and keychain entries
    if (previousExtensionConfig?.settings) {
      for (const setting of previousExtensionConfig.settings) {
        if (setting.sensitive) {
          // Errors are ok, the secret might not be there.
          await keychain.deleteSecret(setting.envVar).catch(() => {});
        }
      }
    }
    return;
  }

  let settingsToPrompt = settings;
  if (previousExtensionConfig) {
    const oldSettings = new Set(
      previousExtensionConfig.settings?.map((s) => s.name) || [],
    );
    settingsToPrompt = settingsToPrompt.filter((s) => !oldSettings.has(s.name));
  }

  const allSettings: Record<string, string> = { ...(previousSettings ?? {}) };

  if (settingsToPrompt && settingsToPrompt.length > 0) {
    for (const setting of settingsToPrompt) {
      const answer = await requestSetting(setting);
      allSettings[setting.envVar] = answer;
    }
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

  if (previousExtensionConfig?.settings) {
    for (const oldSetting of previousExtensionConfig.settings) {
      const newSetting = settings.find((s) => s.name === oldSetting.name);
      if (!newSetting && oldSetting.sensitive) {
        // Setting was removed and was sensitive
        await keychain.deleteSecret(oldSetting.envVar).catch(() => {});
      } else if (newSetting && oldSetting.sensitive && !newSetting.sensitive) {
        // Setting is no longer sensitive
        await keychain.deleteSecret(oldSetting.envVar).catch(() => {});
      }
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
  const extensionStorage = new ExtensionStorage(extensionConfig.name);
  const keychain = new KeychainTokenStorage(extensionId);
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
