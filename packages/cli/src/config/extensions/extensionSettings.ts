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

export interface ExtensionSetting {
  name: string;
  description: string;
  envVar: string;
}

export async function maybePromptForSettings(
  extensionConfig: ExtensionConfig,
  requestSetting: (setting: ExtensionSetting) => Promise<string>,
  previousExtensionConfig?: ExtensionConfig,
  previousSettings?: Record<string, string>,
): Promise<void> {
  const { name: extensionName, settings } = extensionConfig;
  const envFilePath = new ExtensionStorage(extensionName).getEnvFilePath();

  if (!settings || settings.length === 0) {
    // No settings for this extension. Clear any existing .env file.
    if (fsSync.existsSync(envFilePath)) {
      await fs.writeFile(envFilePath, '');
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

  const validEnvVars = new Set(settings.map((s) => s.envVar));
  const finalSettings: Record<string, string> = {};
  for (const [key, value] of Object.entries(allSettings)) {
    if (validEnvVars.has(key)) {
      finalSettings[key] = value;
    }
  }

  let envContent = '';
  for (const [key, value] of Object.entries(finalSettings)) {
    envContent += `${key}=${value}\n`;
  }

  await fs.writeFile(envFilePath, envContent);
}

export async function promptForSetting(
  setting: ExtensionSetting,
): Promise<string> {
  const response = await prompts({
    // type: setting.sensitive ? 'password' : 'text',
    type: 'text',
    name: 'value',
    message: `${setting.name}\n${setting.description}`,
  });
  return response.value;
}

export function getEnvContents(
  extensionStorage: ExtensionStorage,
): Record<string, string> {
  let customEnv: Record<string, string> = {};
  if (fsSync.existsSync(extensionStorage.getEnvFilePath())) {
    const envFile = fsSync.readFileSync(
      extensionStorage.getEnvFilePath(),
      'utf-8',
    );
    customEnv = dotenv.parse(envFile);
  }
  return customEnv;
}
