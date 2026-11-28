/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { platform } from 'node:os';
import process from 'node:process';

export function getSystemSettingsPath(): string {
  if (process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH']) {
    return process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
  }
  if (platform() === 'darwin') {
    return '/Library/Application Support/GeminiCli/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\gemini-cli\\settings.json';
  } else {
    return '/etc/gemini-cli/settings.json';
  }
}

export function getSystemDefaultsPath(): string {
  if (process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH']) {
    return process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH'];
  }
  return path.join(
    path.dirname(getSystemSettingsPath()),
    'system-defaults.json',
  );
}
