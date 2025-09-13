/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Argv } from 'yargs';
import {
  installExtension,
  type ExtensionInstallMetadata,
} from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';

// Regular expression to match 'org/repo' format.
const ORG_REPO_REGEX = /^[a-zA-Z0-9-]+\/[\w.-]+$/;

// Defines the shape of the arguments for the install command.
interface InstallArgs {
  source?: string;
  path?: string;
  ref?: string;
}

/**
 * Handles the logic for installing an extension based on the provided arguments.
 * @param args - The installation arguments.
 */
export async function handleInstall(args: InstallArgs) {
  try {
    let installMetadata: ExtensionInstallMetadata;

    if (args.source) {
      let { source } = args;

      // Check if the source is a shorthand and convert it to a full GitHub URL.
      if (
        !source.startsWith('http://') &&
        !source.startsWith('https://') &&
        !source.startsWith('git@')
      ) {
        if (ORG_REPO_REGEX.test(source)) {
          source = `https://github.com/${source}.git`;
        } else {
          throw new Error(
            `The source "${source}" is not a valid URL or "org/repo" format.`,
          );
        }
      }

      installMetadata = {
        source,
        type: 'git',
        ref: args.ref,
      };
    } else if (args.path) {
      installMetadata = {
        source: args.path,
        type: 'local',
      };
    } else {
      // This should not be reached due to the yargs check, but serves as a safeguard.
      throw new Error('Either --source or --path must be provided.');
    }

    const name = await installExtension(installMetadata);
    console.log(`Extension "${name}" installed successfully and enabled.`);
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const installCommand = {
  command: 'install',
  describe: 'Installs an extension from a local path or git repository.',
  builder: (yargs: Argv) => {
    return yargs
      .option('source', {
        alias: 's',
        type: 'string',
        description:
          'The git repository URL or `org/repo` abbreviation to install from.',
      })
      .option('path', {
        alias: 'p',
        type: 'string',
        description: 'The local path to install from.',
      })
      .option('ref', {
        describe: 'The git ref (branch, tag, or commit) to install from.',
        type: 'string',
      })
      // Ensure that 'source' and 'path' are not used together.
      .conflicts('source', 'path')
      // Ensure that 'ref' is not used with 'path'.
      .conflicts('path', 'ref')
      // Custom validation check.
      .check((argv) => {
        if (!argv.source && !argv.path) {
          throw new Error('Either --source or --path must be provided.');
        }
        return true;
      });
  },
  handler: async (argv: unknown) => {
    // The unknown type is used here to bridge the yargs argv type with our strictly typed interface.
    // The builder's options and checks ensure the object shape is correct.
    await handleInstall(argv as InstallArgs);
  },
};