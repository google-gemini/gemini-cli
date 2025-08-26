/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { enableExtension } from '../../config/extension.js';
import { SettingScope } from '../../config/settings.js';
import { getErrorMessage } from '../../utils/errors.js';

interface EnableArgs {
  name: string;
  scope?: SettingScope;
}

export async function handleEnable(args: EnableArgs) {
  try {
    const scopes = args.scope
      ? [args.scope]
      : [SettingScope.User, SettingScope.Workspace];
    enableExtension(args.name, scopes);
    if (args.scope) {
      console.log(
        `Extension "${args.name}" successfully enabled for scope "${args.scope}".`,
      );
    } else {
      console.log(
        `Extension "${args.name}" successfully enabled in all scopes.`,
      );
    }
  } catch (error) {
    console.error(getErrorMessage(error));
    throw error;
  }
}

export const enableCommand: CommandModule = {
  command: 'disable [--scope] <name>',
  describe: 'Enables an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to enable.',
        type: 'string',
      })
      .option('scope', {
        describe:
          'The scope to enable the extenison in. If not set, will be enabled in all scopes.',
        type: 'string',
        choices: [SettingScope.User, SettingScope.Workspace],
      })
      .check((_argv) => true),
  handler: async (argv) => {
    await handleEnable({
      name: argv['name'] as string,
      scope: argv['scope'] as SettingScope,
    });
  },
};
