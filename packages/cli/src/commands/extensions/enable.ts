/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { FatalConfigError, getErrorMessage } from '@google/gemini-cli-core';
import { enableExtension } from '../../config/extension.js';
import { SettingScope } from '../../config/settings.js';
import { ExtensionEnablementManager } from '../../config/extensions/extensionEnablement.js';

interface EnableArgs {
  name: string;
  scope?: string;
}

export function handleEnable(args: EnableArgs) {
  const extensionEnablementManager = new ExtensionEnablementManager();
  try {
    if (args.scope?.toLowerCase() === 'workspace') {
      enableExtension(
        args.name,
        SettingScope.Workspace,
        extensionEnablementManager,
      );
    } else {
      enableExtension(args.name, SettingScope.User, extensionEnablementManager);
    }
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
    throw new FatalConfigError(getErrorMessage(error));
  }
}

export const enableCommand: CommandModule = {
  command: 'enable [--scope] <name>',
  describe: 'Enables an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to enable.',
        type: 'string',
      })
      .option('scope', {
        describe:
          'The scope to enable the extension in. If not set, will be enabled in all scopes.',
        type: 'string',
      })
      .check((argv) => {
        if (
          argv.scope &&
          !Object.values(SettingScope)
            .map((s) => s.toLowerCase())
            .includes((argv.scope as string).toLowerCase())
        ) {
          throw new Error(
            `Invalid scope: ${argv.scope}. Please use one of ${Object.values(
              SettingScope,
            )
              .map((s) => s.toLowerCase())
              .join(', ')}.`,
          );
        }
        return true;
      }),
  handler: (argv) => {
    handleEnable({
      name: argv['name'] as string,
      scope: argv['scope'] as string,
    });
  },
};
