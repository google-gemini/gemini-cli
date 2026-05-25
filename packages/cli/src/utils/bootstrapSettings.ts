/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';

const GEMINI_DIR = '.gemini';
const SETTINGS_FILE = 'settings.json';

/**
 * Resolves the global user settings path without importing the full core package.
 *
 * The lightweight parent process runs before core is loaded, but it still needs
 * to honor the same global settings path used by Storage.getGlobalSettingsPath().
 */
export function getBootstrapSettingsPath(): string {
  const homeDir = process.env['GEMINI_CLI_HOME'] || os.homedir();
  const globalGeminiDir = homeDir
    ? path.join(homeDir, GEMINI_DIR)
    : path.join(os.tmpdir(), GEMINI_DIR);
  return path.join(globalGeminiDir, SETTINGS_FILE);
}
