/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';

export const enableCommand: CommandModule = {
  command: 'enable <command>',
  describe: 'Enable a hook by command name',
  handler: async (argv) => {
    try {
      const commandToEnable = argv['command'] as string;
      console.log(`Enabling hook: ${commandToEnable}`);

      const settings = loadSettings();

      // Get current disabled hooks list
      const currentDisabledHooks = settings.merged.disabledHooks || [];

      // Remove from disabled list if present
      if (!currentDisabledHooks.includes(commandToEnable)) {
        console.log(`Hook "${commandToEnable}" is already enabled.`);
        return;
      }

      const newDisabledHooks = currentDisabledHooks.filter(
        (cmd) => cmd !== commandToEnable,
      );

      // Persist to user settings
      settings.setValue(SettingScope.User, 'disabledHooks', newDisabledHooks);
      console.log(
        `Hook "${commandToEnable}" enabled. This will persist across sessions for all hook sources.`,
      );
    } catch (error) {
      console.error('Failed to enable hook:', error);
      throw error;
    }
  },
};
