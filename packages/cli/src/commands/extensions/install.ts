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
  ref?: string;
  subpath?: string;
}

const ORG_REPO_REGEX = /^[a-zA-Z0-9-]+\/[\w.-]+$/;

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
          ref: args.ref,
          subpath: args.subpath,
        };
      } else if (ORG_REPO_REGEX.test(source)) {
        installMetadata = {
          source: `https://github.com/${source}.git`,
          type: 'git',
          ref: args.ref,
          subpath: args.subpath,
        };
      } else {
        throw new Error(
          `The source "${source}" is not a valid URL or "org/repo" format.`,
        );
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
  describe:
    'Installs an extension from a git repository (URL or "org/repo") or a local path.',
  builder: (yargs) =>
    yargs
      .option('source', {
        describe: 'The git URL or "org/repo" of the extension to install.',
        type: 'string',
      })
      .option('path', {
        describe: 'Path to a local extension directory.',
        type: 'string',
      })
      .option('ref', {
        describe: 'The git ref to install from.',
        type: 'string',
      })
      .option('subpath', {
        describe: 'The git repo subpath to install from.',
        type: 'string',
      })
      .conflicts('source', 'path')
      .conflicts('path', 'ref')
      .conflicts('path', 'subpath')
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
      ref: argv['ref'] as string | undefined,
      subpath: argv['subpath'] as string | undefined,
    });
  },
};
