/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { InstallLocation, uninstallExtension } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import { locationOption } from './options.js';

interface UninstallArgs {
  name: string;
  location: string;
}

export async function handleUninstall(args: UninstallArgs) {
  try {
    const location =
      args.location === 'system'
        ? InstallLocation.System
        : InstallLocation.User;
    await uninstallExtension(args.name, location);
    console.log(`Extension "${args.name}" successfully uninstalled.`);
  } catch (error) {
    console.error(getErrorMessage(error));
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall [--location] <name>',
  describe: 'Uninstalls an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to uninstall.',
        type: 'string',
      })
      .option('location', locationOption)
      .check((argv) => {
        if (!argv.name) {
          throw new Error(
            'Please include the name of the extension to uninstall as a positional argument.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUninstall({
      name: argv['name'] as string,
      location: argv['location'] as string,
    });
  },
};
