/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import chalk from 'chalk';
import { debugLogger, Storage, ProfileManager } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { exitCli } from '../utils.js';

interface InstallArgs {
  path: string;
}

export async function handleInstall(args: InstallArgs) {
  try {
    const manager = new ProfileManager(Storage.getProfilesDir());
    const profile = await manager.installProfile(args.path);
    debugLogger.log(
      chalk.green(`Profile "${profile.name}" installed successfully.`),
    );
    debugLogger.log(
      `Use "gemini profiles enable ${profile.name}" to activate it.`,
    );
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const installCommand: CommandModule = {
  command: 'install <path>',
  describe: 'Installs a profile by copying it from a local path.',
  builder: (yargs) =>
    yargs.positional('path', {
      describe: 'The local path of the profile file to install.',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    await handleInstall({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      path: argv['path'] as string,
    });
    await exitCli();
  },
};
