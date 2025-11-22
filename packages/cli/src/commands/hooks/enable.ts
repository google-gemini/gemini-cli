/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import type { HookDefinition } from '@google/gemini-cli-core';

export const enableCommand: CommandModule = {
  command: 'enable <command>',
  describe: 'Enable a hook by command name',
  handler: async (argv) => {
    const commandToEnable = argv.command as string;
    console.log(`Enabling hook: ${commandToEnable}`);

    const settings = loadSettings();
    const userSettings = settings.user.settings;

    if (!userSettings.hooks) {
      console.log('No hooks configured in user settings.');
      return;
    }

    let found = false;
    for (const definitions of Object.values(userSettings.hooks)) {
      if (Array.isArray(definitions)) {
        for (const def of definitions as HookDefinition[]) {
          for (const hook of def.hooks) {
            if (hook.type === 'command' && hook.command === commandToEnable) {
              hook.enabled = true;
              found = true;
            }
          }
        }
      }
    }

    if (found) {
      settings.setValue(SettingScope.User, 'hooks', userSettings.hooks);
      console.log(`Hook "${commandToEnable}" enabled.`);
    } else {
      console.log(`Hook "${commandToEnable}" not found in user settings.`);
    }
    process.exit(0);
  },
};
