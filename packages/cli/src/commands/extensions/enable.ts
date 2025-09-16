/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { FatalConfigError, getErrorMessage } from '@google/gemini-cli-core';
import {
  enableExtension,
  overrideExtensionForWorkspace,
} from '../../config/extension.js';
import { loadSettings, SettingScope } from '../../config/settings.js';

interface EnableArgs {
  name: string;
  scope?: SettingScope;
  override?: boolean;
}

export async function handleEnable(args: EnableArgs) {
  try {
    const cwd = process.cwd();
    if (args.override) {
      if (args.scope !== SettingScope.Workspace) {
        throw new Error(
          'The --override flag can only be used with --scope=Workspace.',
        );
      }
      overrideExtensionForWorkspace(args.name, cwd);
      console.log(
        `Workspace override created for extension "${args.name}". It will now be active in this workspace.`,
      );
      return;
    }

    const settings = loadSettings(cwd);
    if (args.scope === SettingScope.Workspace) {
      const userDisabled =
        settings
          .forScope(SettingScope.User)
          .settings.extensions?.disabled?.includes(args.name) ?? false;
      if (userDisabled) {
        throw new Error(
          `Extension "${args.name}" is disabled at the user level. To enable it for this workspace only, use the --override flag.`,
        );
      }
    }

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
    throw new FatalConfigError(getErrorMessage(error));
  }
}

export const enableCommand: CommandModule = {
  command: 'enable [--scope] [--override] <name>',
  describe: 'Enables an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to enable.',
        type: 'string',
      })
      .option('scope', {
        describe:
          'The scope to enable the extenison in (values: "user", "workspace"). If not set, will be enabled in all scopes.',
        type: 'string',
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
      .option('override', {
        describe: 'Override any settings disabling this extension.',
        type: 'boolean',
        default: false,
      })
      .check((_argv) => true),
  handler: async (argv) => {
    await handleEnable({
      name: argv['name'] as string,
      scope: argv['scope'] as SettingScope,
      override: argv['override'] as boolean,
    });
  },
};
