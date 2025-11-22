/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import type { HookDefinition } from '@google/gemini-cli-core';

export const disableCommand: CommandModule = {
  command: 'disable <command>',
  describe: 'Disable a hook by command name',
  handler: async (argv) => {
    try {
      const commandToDisable = argv['command'] as string;
      console.log(`Disabling hook: ${commandToDisable}`);

      const settings = loadSettings();
      const userSettings = settings.user.settings;

      if (!userSettings.hooks) {
        console.log('No hooks configured in user settings.');
        return;
      }

      // Deep copy to avoid mutation of the original settings object
      const newHooks = JSON.parse(JSON.stringify(userSettings.hooks));

      let found = false;
      for (const definitions of Object.values(newHooks)) {
        if (Array.isArray(definitions)) {
          for (const def of definitions as HookDefinition[]) {
            for (const hook of def.hooks) {
              if (
                hook.type === 'command' &&
                hook.command === commandToDisable
              ) {
                hook.enabled = false;
                found = true;
              }
            }
          }
        }
      }

      if (found) {
        settings.setValue(SettingScope.User, 'hooks', newHooks);
        console.log(`Hook "${commandToDisable}" disabled.`);
      } else {
        console.log(`Hook "${commandToDisable}" not found in user settings.`);
      }
    } catch (error) {
      console.error('Failed to disable hook:', error);
      throw error;
    }
  },
};
