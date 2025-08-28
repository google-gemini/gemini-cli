/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  installExtension,
  type ExtensionInstallMetadata,
  InstallLocation,
} from '../../config/extension.js';

import { getErrorMessage } from '../../utils/errors.js';
import { locationOption } from './options.js';

interface InstallArgs {
  source?: string;
  path?: string;
  location: string;
}

export async function handleInstall(args: InstallArgs) {
  try {
    const installMetadata: ExtensionInstallMetadata = {
      source: (args.source || args.path) as string,
      type: args.source ? 'git' : 'local',
    };
    const location =
      args.location === 'system'
        ? InstallLocation.System
        : InstallLocation.User;
    const extensionName = await installExtension(installMetadata, location);
    console.log(
      `Extension "${extensionName}" installed successfully and enabled.`,
    );
  } catch (error) {
    console.error(getErrorMessage(error));
    throw error;
  }
}

export const installCommand: CommandModule = {
  command: 'install [--source | --path] [--location]',
  describe: 'Installs an extension from a git repository or a local path.',
  builder: (yargs) =>
    yargs
      .option('source', {
        describe: 'The git URL of the extension to install.',
        type: 'string',
      })
      .option('path', {
        describe: 'Path to a local extension directory.',
        type: 'string',
      })
      .option('location', locationOption)
      .conflicts('source', 'path')
      .check((argv) => {
        if (!argv.source && !argv.path) {
          throw new Error(
            'Either a git URL --source or a --path must be provided.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    await handleInstall({
      source: argv['source'] as string | undefined,
      path: argv['path'] as string | undefined,
      location: argv['location'] as string,
    });
  },
};
