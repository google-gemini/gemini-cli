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
  path: string;
}

export async function handleLink(args: InstallArgs) {
  try {
    const installMetadata: ExtensionInstallMetadata = {
      source: args.path,
      type: 'link',
    };
    const extensionName = await installExtension(installMetadata);
    console.log(
      `Extension "${extensionName}" linked successfully and enabled.`,
    );
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const linkCommand: CommandModule = {
  command: 'link <path>',
  describe:
    'Links an extension from a local path. Updates made to the local path will always be reflected.',
  builder: (yargs) =>
    yargs
      .positional('path', {
        describe: 'The name of the extension to link.',
        type: 'string',
      })
      .check((_) => true),
  handler: async (argv) => {
    await handleLink({
      path: argv['path'] as string,
    });
  },
};
