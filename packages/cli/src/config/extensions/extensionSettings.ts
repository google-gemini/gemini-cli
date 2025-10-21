/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ExtensionStorage } from '../extension.js';
import type { ExtensionConfig } from '../extension.js';

import { Writable } from 'node:stream';

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
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const query = `${setting.name}\n${setting.description}\n> `;
    if (setting.sensitive) {
      // TODO(b/361036983): Mask sensitive input.
      // This is non-trivial in Node.js and will be implemented separately.
      // For now, we just don't echo the output.
      const silentOutput = new Writable({
        write: (
          _chunk: unknown,
          _encoding: string,
          callback: (error?: Error | null) => void,
        ) => {
          callback();
        },
      });
      const rlSensitive = readline.createInterface({
        input: process.stdin,
        output: silentOutput,
        terminal: true,
      });
      process.stdout.write(query);
      rlSensitive.question(query, (answer) => {
        process.stdout.write('\n');
        rlSensitive.close();
        resolve(answer);
      });
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}
