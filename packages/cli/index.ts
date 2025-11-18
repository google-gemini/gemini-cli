#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './src/gemini.js';
import { main } from './src/gemini.js';
import { debugLogger, FatalError } from '@google/gemini-cli-core';

export {
  loadSettings,
  saveSettings,
  SettingScope,
  type Settings,
} from './src/config/settings.js';
export {
  themeManager,
  type ThemeDisplay,
} from './src/ui/themes/theme-manager.js';
export {
  getSettingsSchema,
  type SettingsSchema,
  type SettingDefinition,
  type SettingEnumOption,
} from './src/config/settingsSchema.js';

// --- Global Entry Point ---
main().catch((error) => {
  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env['NO_COLOR']) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    debugLogger.error(errorMessage);
    process.exit(error.exitCode);
  }
  debugLogger.error('An unexpected critical error occurred:');
  if (error instanceof Error) {
    debugLogger.error(error.stack);
  } else {
    debugLogger.error(String(error));
  }
  process.exit(1);
});
