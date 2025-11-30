/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';

export const disableCommand: CommandModule = {
  command: 'disable <command>',
  describe: 'Disable a hook by command name',
  handler: async (argv) => {
    try {
      const commandToDisable = argv['command'] as string;
      console.log(`Disabling hook: ${commandToDisable}`);

      const settings = loadSettings();

      // Get current disabled hooks list
      const currentDisabledHooks = settings.merged.disabledHooks || [];

      // Add to disabled list if not already there
      if (currentDisabledHooks.includes(commandToDisable)) {
        console.log(`Hook "${commandToDisable}" is already disabled.`);
        return;
      }

      const newDisabledHooks = [...currentDisabledHooks, commandToDisable];

      // Persist to user settings
      settings.setValue(SettingScope.User, 'disabledHooks', newDisabledHooks);
      console.log(
        `Hook "${commandToDisable}" disabled. This will persist across sessions for all hook sources.`,
      );
    } catch (error) {
      console.error('Failed to disable hook:', error);
      throw error;
    }
  },
};
