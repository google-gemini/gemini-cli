/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fsp } from 'fs';
import path from 'path';

interface Settings {
  [key: string]:
    | string
    | boolean
    | number
    | Settings
    | Array<string | boolean | number | Settings>;
}

// TODO(recon): This is a placeholder. Replace with a more robust implementation.
export async function get(key: string): Promise<string | boolean | number | Settings | Array<string | boolean | number | Settings> | undefined> {
  try {
    const settings = await readSettings();
    return settings[key];
  } catch (error) {
    console.error('Error in get command:', error);
    return undefined;
  }
}

// TODO(recon): This is a placeholder. Replace with a more robust implementation.
export async function set(key: string, value: string) {
  try {
    const settings = await readSettings();

    let parsedValue: string | boolean | number = value;
    if (value.toLowerCase() === 'true') {
      parsedValue = true;
    } else if (value.toLowerCase() === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value)) && value.trim() !== '') {
      parsedValue = Number(value);
    }

    settings[key] = parsedValue;
    await writeSettings(settings);
  } catch (error) {
    console.error('Error in set command:', error);
  }
}

async function readSettings(): Promise<Settings> {
    const settingsPath = path.join(process.cwd(), '.gemini', 'settings.json');
    try {
        const data = await fsp.readFile(settingsPath, 'utf-8');
        return JSON.parse(data) as Settings;
    } catch (e) {
        const error = e as { code: string };
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

async function writeSettings(settings: Settings) {
    const settingsPath = path.join(process.cwd(), '.gemini', 'settings.json');
    const data = JSON.stringify(settings, null, 2);
    await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsp.writeFile(settingsPath, data, 'utf-8');
}
