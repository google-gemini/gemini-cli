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
        describe:
          'The scope to disable the extenison in (values: "user", "workspace").',
        type: 'string',
        default: SettingScope.User,
      })
      .coerce('scope', (arg?: string): SettingScope | undefined => {
        if (arg === undefined) {
          return undefined;
        }
        const lowerArg = arg.toLowerCase();
        if (lowerArg === 'user') {
          return SettingScope.User;
        }
        if (lowerArg === 'workspace') {
          return SettingScope.Workspace;
        }
        throw new Error(
          `Invalid scope "${arg}". Please use "user" or "workspace".`,
        );
      })
      .check((_argv) => true),
  handler: async (argv) => {
    await handleDisable({
      name: argv['name'] as string,
      scope: argv['scope'] as SettingScope,
    });
  },
};
