/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import chalk from 'chalk';
import { debugLogger } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { ProfileManager } from '../../config/profile-manager.js';
import { loadSettings } from '../../config/settings.js';
import { exitCli } from '../utils.js';

interface LinkArgs {
  path: string;
}

export async function handleLink(args: LinkArgs) {
  try {
    const settings = loadSettings();
    const profileManager = new ProfileManager(settings);
    const profile = await profileManager.linkProfile(args.path);
    debugLogger.log(
      chalk.green(`Profile "${profile.name}" linked successfully.`),
    );
    debugLogger.log(
      `Use "gemini profiles enable ${profile.name}" to activate it.`,
    );
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const linkCommand: CommandModule = {
  command: 'link <path>',
  describe:
    'Links a profile from a local path. Changes to the local file will be reflected in the profile.',
  builder: (yargs) =>
    yargs.positional('path', {
      describe: 'The local path of the profile file to link.',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    await handleLink({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      path: argv['path'] as string,
    });
    await exitCli();
  },
};
