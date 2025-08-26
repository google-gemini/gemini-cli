/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { disableExtension } from '../../config/extension.js';
import { SettingScope } from '../../config/settings.js';
import { getErrorMessage } from '../../utils/errors.js';

interface DisableArgs {
  name: string;
  scope: SettingScope;
}

export async function handleDisable(args: DisableArgs) {
  try {
    disableExtension(args.name, args.scope);
    console.log(
      `Extension "${args.name}" successfully disabled for scope "${args.scope}".`,
    );
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const disableCommand: CommandModule = {
  command: 'disable [--scope] <name>',
  describe: 'Disables an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to disable.',
        type: 'string',
      })
      .option('scope', {
        describe: 'The scope to disable the extenison in.',
        type: 'string',
        default: SettingScope.User,
        choices: [SettingScope.User, SettingScope.Workspace],
      })
      .check((_argv) => true),
  handler: async (argv) => {
    await handleDisable({
      name: argv['name'] as string,
      scope: argv['scope'] as SettingScope,
    });
  },
};
