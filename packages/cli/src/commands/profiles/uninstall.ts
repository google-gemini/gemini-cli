/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';
import { ProfileManager } from '../../config/profile-manager.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

/**
 * Command module for `gemini profiles uninstall <name>`.
 */
export const uninstallCommand: CommandModule = {
  command: 'uninstall <name>',
  describe: 'Uninstalls a profile.',
  builder: (yargs) =>
    yargs.positional('name', {
      describe: 'The name of the profile to uninstall.',
      type: 'string',
    }),
  handler: async (argv) => {
    const name = String(argv['name']);
    try {
      const settings = loadSettings();
      const manager = new ProfileManager(settings);

      await manager.uninstallProfile(name);
      debugLogger.log(`Profile "${name}" successfully uninstalled.`);
      // eslint-disable-next-line no-console
      console.log(`Profile "${name}" successfully uninstalled.`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Error uninstalling profile: ${error instanceof Error ? error.message : String(error)}`,
      );
      await exitCli(1);
    }
    await exitCli();
  },
};
