/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { uninstallExtension } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';

interface UninstallArgs {
  name: string;
}

export async function handleUninstall(args: UninstallArgs) {
  try {
    await uninstallExtension(args.name);
    console.log(`Extension "${args.name}" successfully uninstalled.`);
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall <name>',
  describe: 'Uninstalls an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to uninstall.',
        type: 'string',
      })
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
    });
  },
};
