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

    // Get list of extensions to uninstall
    let namesToUninstall: string[];
    if (args.all) {
      const allExtensions = extensionManager.getExtensions();
      if (allExtensions.length === 0) {
        debugLogger.log('No extensions installed.');
        return;
      }
      namesToUninstall = allExtensions.map((ext) => ext.name);
    } else {
      namesToUninstall = args.names ?? [];
    }

    const errors: Array<{ name: string; error: string }> = [];
    for (const name of [...new Set(namesToUninstall)]) {
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
  command: 'uninstall [<names..>] [--all]',
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
        describe: 'Uninstall all extensions.',
        type: 'boolean',
      })
      .conflicts('names', 'all')
      .check((argv) => {
        if (!argv.all && (!argv.names || argv.names.length === 0)) {
          throw new Error(
            'Either extension name(s) or --all must be provided.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUninstall({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      names: argv['names'] as string[] | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      all: argv['all'] as boolean | undefined,
    });
    await exitCli();
  },
};
