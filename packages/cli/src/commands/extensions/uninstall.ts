/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { uninstallExtension } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';

interface UninstallArgs {
  identifier: string; // can be extension name or source URL.
}

export async function handleUninstall(args: UninstallArgs) {
  try {
    await uninstallExtension(args.identifier);
    console.log(`Extension "${args.identifier}" successfully uninstalled.`);
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall <identifier>',
  describe: 'Uninstalls an extension.',
  builder: (yargs) =>
    yargs
      .positional('identifier', {
        describe: 'The identifier of the extension to uninstall.',
        type: 'string',
      })
      .check((argv) => {
        if (!argv.identifier) {
          throw new Error(
            'Please include the identifier of the extension to uninstall as a positional argument.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUninstall({
      identifier: argv['identifier'] as string,
    });
  },
};
