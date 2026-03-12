/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

/**
 * Command module for `gemini profiles disable`.
 */
export const disableCommand: CommandModule = {
  command: 'disable',
  describe: 'Disables the currently active profile.',
  handler: async () => {
    try {
      const settings = loadSettings();
      settings.setValue(SettingScope.User, 'general.activeProfile', undefined);
      debugLogger.log('Profile disabled. Reverting to default behavior.');
      // eslint-disable-next-line no-console
      console.log('Profile disabled. Reverting to default behavior.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Error disabling profile: ${error instanceof Error ? error.message : String(error)}`,
      );
      await exitCli(1);
    }
    await exitCli();
  },
};
