/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  installExtension,
  type ExtensionInstallMetadata,
} from '../../config/extension.js';

import { getErrorMessage } from '../../utils/errors.js';

interface InstallArgs {
  source?: string;
  path?: string;
}

export async function handleInstall(args: InstallArgs) {
  try {
    let installMetadata: ExtensionInstallMetadata;

    if (args.source) {
      const { source } = args;
      if (
        source.startsWith('http://') ||
        source.startsWith('https://') ||
        source.startsWith('git@')
      ) {
        installMetadata = {
          source,
          type: 'git',
        };
      } else {
        throw new Error(`The source "${source}" is not a valid URL format.`);
      }
    } else if (args.path) {
      installMetadata = {
        source: args.path,
        type: 'local',
      };
    } else {
      // This should not be reached due to the yargs check.
      throw new Error('Either --source or --path must be provided.');
    }

    const extensionName = await installExtension(installMetadata);
    console.log(
      `Extension "${extensionName}" installed successfully and enabled.`,
    );
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const installCommand: CommandModule = {
  command: 'install [--source | --path ]',
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
      .conflicts('source', 'path')
      .check((argv) => {
        if (!argv.source && !argv.path) {
          throw new Error('Either --source or --path must be provided.');
        }
        return true;
      }),
  handler: async (argv) => {
    await handleInstall({
      source: argv['source'] as string | undefined,
      path: argv['path'] as string | undefined,
    });
  },
};
