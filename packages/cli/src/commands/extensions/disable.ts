/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger, getErrorMessage } from '@google/gemini-cli-core';
import { ExtensionManager } from '../../config/extension-manager.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface DisableArgs {
  names?: string[];
  all?: boolean;
  scope?: string;
}

export async function handleDisable(args: DisableArgs) {
  const workspaceDir = process.cwd();
  const extensionManager = new ExtensionManager({
    workspaceDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    settings: loadSettings(workspaceDir).merged,
  });
  await extensionManager.loadExtensions();

  const scope =
    args.scope?.toLowerCase() === 'workspace'
      ? SettingScope.Workspace
      : SettingScope.User;

  let namesToDisable: string[] = [];
  if (args.all) {
    namesToDisable = extensionManager.getExtensions().map((ext) => ext.name);
  } else if (args.names) {
    namesToDisable = [...new Set(args.names)];
  }

  if (namesToDisable.length === 0) {
    if (args.all) {
      debugLogger.log('No extensions currently installed.');
    }
    return;
  }

  const errors: Array<{ name: string; error: string }> = [];

  for (const name of namesToDisable) {
    try {
      await extensionManager.disableExtension(name, scope);
      debugLogger.log(
        `Extension "${name}" successfully disabled for scope "${args.scope}".`,
      );
    } catch (error) {
      errors.push({ name, error: getErrorMessage(error) });
    }
  }

  if (errors.length > 0) {
    for (const { name, error } of errors) {
      debugLogger.error(`Failed to disable "${name}": ${error}`);
    }
    await exitCli(1);
  }
}

export const disableCommand: CommandModule = {
  command: 'disable [names..]',
  describe: 'Disables one or more extensions.',
  builder: (yargs) =>
    yargs
      .positional('names', {
        describe: 'The name(s) of the extension(s) to disable.',
        type: 'string',
        array: true,
      })
      .option('all', {
        type: 'boolean',
        describe: 'Disable all installed extensions.',
        default: false,
      })
      .option('scope', {
        describe: 'The scope to disable the extension in.',
        type: 'string',
        default: SettingScope.User,
      })
      .check((argv) => {
        if (!argv.all && (!argv.names || argv.names.length === 0)) {
          throw new Error(
            'Please include at least one extension name to disable as a positional argument, or use the --all flag.',
          );
        }
        if (
          argv.scope &&
          !Object.values(SettingScope)
            .map((s) => s.toLowerCase())
            .includes(argv.scope.toLowerCase())
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
  handler: async (argv) => {
    const rawNames = argv['names'];
    const names =
      rawNames === undefined
        ? undefined
        : Array.isArray(rawNames)
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (rawNames as string[])
          : [String(rawNames)];
    await handleDisable({
      names,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      all: argv['all'] as boolean,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      scope: argv['scope'] as string,
    });
    await exitCli();
  },
};
