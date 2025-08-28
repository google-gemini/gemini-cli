/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { InstallLocation, updateExtension } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import { locationOption } from './options.js';

interface UpdateArgs {
  name: string;
  location: string;
}

export async function handleUpdate(args: UpdateArgs) {
  try {
    const location =
      args.location === 'system'
        ? InstallLocation.System
        : InstallLocation.User;
    const updatedExtensionInfo = await updateExtension(args.name, location);
    if (!updatedExtensionInfo) {
      console.log(`Extension "${args.name}" failed to update.`);
      return;
    }
    console.log(
      `Extension "${args.name}" updated: ${updatedExtensionInfo.originalVersion} → ${updatedExtensionInfo.updatedVersion}.`,
    );
  } catch (error) {
    console.error(getErrorMessage(error));
  }
}

export const updateCommand: CommandModule = {
  command: 'update [--location] <name>',
  describe: 'Updates an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to update.',
        type: 'string',
      })
      .option('location', locationOption)
      .check((_argv) => true),
  handler: async (argv) => {
    await handleUpdate({
      name: argv['name'] as string,
      location: argv['location'] as string,
    });
  },
};
