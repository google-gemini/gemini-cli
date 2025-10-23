/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import {
  debugLogger,
  FatalConfigError,
  getErrorMessage,
} from '@google/gemini-cli-core';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';

interface EnableArgs {
  name: string;
  scope?: string;
}

export function handleEnable(args: EnableArgs) {
  const workingDir = process.cwd();
  const extensionManager = new ExtensionManager({
    workspaceDir: workingDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    loadedSettings: loadSettings(workingDir),
  });
  try {
    if (args.scope?.toLowerCase() === 'workspace') {
      extensionManager.enableExtension(args.name, SettingScope.Workspace);
    } else {
      extensionManager.enableExtension(args.name, SettingScope.User);
    }
    if (args.scope) {
      debugLogger.log(
        `Extension "${args.name}" successfully enabled for scope "${args.scope}".`,
      );
    } else {
      debugLogger.log(
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
