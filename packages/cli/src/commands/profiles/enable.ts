/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { Storage, ProfileManager, debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

/**
 * Command module for `gemini profiles enable <name>`.
 */
export const enableCommand: CommandModule = {
  command: 'enable <name>',
  describe: 'Enables a profile persistently.',
  builder: (yargs) =>
    yargs.positional('name', {
      describe: 'The name of the profile to enable.',
      type: 'string',
    }),
  handler: async (argv) => {
    const name = String(argv['name']);
    try {
      const settings = loadSettings();
      const profilesDir = Storage.getProfilesDir();
      const manager = new ProfileManager(profilesDir);
      await manager.load();

      if (!manager.getProfile(name)) {
        throw new Error(`Profile "${name}" not found.`);
      }

      settings.setValue(SettingScope.User, 'general.activeProfile', name);
      debugLogger.log(`Profile "${name}" successfully enabled.`);
      // eslint-disable-next-line no-console
      console.log(`Profile "${name}" successfully enabled.`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Error enabling profile: ${error instanceof Error ? error.message : String(error)}`,
      );
      await exitCli(1);
    }
    await exitCli();
  },
};
