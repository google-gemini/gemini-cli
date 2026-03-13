/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger } from '@google/gemini-cli-core';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface UninstallArgs {
  names?: string[]; // can be extension names or source URLs.
  all?: boolean;
}

export async function handleUninstall(args: UninstallArgs) {
  try {
    const workspaceDir = process.cwd();
    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent: requestConsentNonInteractive,
      requestSetting: promptForSetting,
      settings: loadSettings(workspaceDir).merged,
    });
    await extensionManager.loadExtensions();

    let namesToUninstall: string[] = [];
    if (args.all) {
      namesToUninstall = extensionManager
        .getExtensions()
        .map((ext) => ext.name);
    } else if (args.names) {
      namesToUninstall = [...new Set(args.names)];
    }

    if (namesToUninstall.length === 0) {
      if (args.all) {
        debugLogger.log('No extensions currently installed.');
      }
      return;
    }

    const errors: Array<{ name: string; error: string }> = [];
    for (const name of namesToUninstall) {
      try {
        await extensionManager.uninstallExtension(name, false);
        debugLogger.log(`Extension "${name}" successfully uninstalled.`);
      } catch (error) {
        errors.push({ name, error: getErrorMessage(error) });
      }
    }

    if (errors.length > 0) {
      for (const { name, error } of errors) {
        debugLogger.error(`Failed to uninstall "${name}": ${error}`);
      }
      process.exit(1);
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall [names..]',
  describe: 'Uninstalls one or more extensions.',
  builder: (yargs) =>
    yargs
      .positional('names', {
        describe:
          'The name(s) or source path(s) of the extension(s) to uninstall.',
        type: 'string',
        array: true,
      })
      .option('all', {
        type: 'boolean',
        describe: 'Uninstall all installed extensions.',
        default: false,
      })
      .check((argv) => {
        if (!argv.all && (!argv.names || argv.names.length === 0)) {
          throw new Error(
            'Please include at least one extension name to uninstall as a positional argument, or use the --all flag.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUninstall({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      names: argv['names'] as string[] | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      all: argv['all'] as boolean,
    });
    await exitCli();
  },
};
