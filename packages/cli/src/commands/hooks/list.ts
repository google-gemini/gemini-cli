/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List configured hooks from settings',
  handler: async () => {
    const settings = loadSettings();
    const hooksConfig = settings.merged.hooks;

    if (!hooksConfig || Object.keys(hooksConfig).length === 0) {
      console.log('No hooks configured.');
      return;
    }

    console.log(`Active configuration source: ${settings.user.path}`);
    console.log('');

    for (const [eventName, definitions] of Object.entries(hooksConfig)) {
      console.log(`Event: ${eventName}`);
      if (Array.isArray(definitions)) {
        for (const def of definitions) {
          if (def.matcher) {
            console.log(`  Matcher: ${def.matcher}`);
          }
          for (const hook of def.hooks) {
            console.log(`  - Type: ${hook.type}`);
            if (hook.type === 'command') {
              console.log(`    Command: ${hook.command}`);
            }
          }
        }
      }
      console.log('');
    }
    process.exit(0);
  },
};
