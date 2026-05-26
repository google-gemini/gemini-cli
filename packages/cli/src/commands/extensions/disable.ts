/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import {
  coreEvents,
  debugLogger,
  FatalConfigError,
  getErrorMessage,
} from '@google/gemini-cli-core';
import { ExtensionManager } from '../../config/extension-manager.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface DisableArgs {
  name: string;
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

  try {
    if (args.scope?.toLowerCase() === 'workspace') {
      await extensionManager.disableExtension(
        args.name,
        SettingScope.Workspace,
      );
    } else {
      await extensionManager.disableExtension(args.name, SettingScope.User);
    }
    const scopeLabel = args.scope ?? SettingScope.User;
    coreEvents.emitConsoleLog(
      'log',
      `Extension "${args.name}" successfully disabled for scope "${scopeLabel}".`,
    );
    debugLogger.log(
      `Extension "${args.name}" successfully disabled for scope "${scopeLabel}".`,
    );
  } catch (error) {
    throw new FatalConfigError(getErrorMessage(error));
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
        describe: 'The scope to disable the extension in.',
        type: 'string',
        default: SettingScope.User,
      })
      .check((argv) => {
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
    await handleDisable({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      name: argv['name'] as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      scope: argv['scope'] as string,
    });
    await exitCli();
  },
};
