/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ExtensionStorage } from '../extension.js';
import type { ExtensionConfig } from '../extension.js';

import prompts from 'prompts';

export interface ExtensionSetting {
  name: string;
  description: string;
  envVar: string;
  sensitive?: boolean;
}

export async function maybePromptForSettings(
  extensionConfig: ExtensionConfig,
  requestSetting: (setting: ExtensionSetting) => Promise<string>,
): Promise<void> {
  const { settings, name: extensionName } = extensionConfig;
  if (!settings || settings.length === 0) {
    return;
  }

  const envFilePath = path.join(
    new ExtensionStorage(extensionName).getExtensionDir(),
    '.env',
  );
  let envContent = '';

  console.log(''); // for spacing
  for (const setting of settings) {
    const answer = await requestSetting(setting);
    envContent += `${setting.envVar}=${answer}\n`;
  }

  await fs.writeFile(envFilePath, envContent);
}

export async function promptForSetting(
  setting: ExtensionSetting,
): Promise<string> {
  if (setting.sensitive) {
    const response = await prompts({
      type: 'password',
      name: 'value',
      message: `${setting.name}\n${setting.description}`,
    });
    return response.value;
  } else {
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      const query = `${setting.name}\n${setting.description}\n> `;
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
}
