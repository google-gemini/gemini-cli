/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  debugLogger,
  type ExtensionInstallMetadata,
} from '@google/gemini-cli-core';

import { getErrorMessage } from '../../utils/errors.js';
import {
  INSTALL_WARNING_MESSAGE,
  requestConsentNonInteractive,
} from '../../config/extensions/consent.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface InstallArgs {
  path: string;
  consent?: boolean;
}

export async function handleLink(args: InstallArgs) {
  try {
    const installMetadata: ExtensionInstallMetadata = {
      source: args.path,
      type: 'link',
    };
    const requestConsent = args.consent
      ? () => Promise.resolve(true)
      : requestConsentNonInteractive;
    if (args.consent) {
      debugLogger.log('You have consented to the following:');
      debugLogger.log(INSTALL_WARNING_MESSAGE);
    }
    const workspaceDir = process.cwd();
    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent,
      requestSetting: promptForSetting,
      settings: loadSettings(workspaceDir).merged,
    });
    await extensionManager.loadExtensions();
    const extension =
      await extensionManager.installOrUpdateExtension(installMetadata);
    debugLogger.log(
      `Extension "${extension.name}" linked successfully and enabled.`,
    );
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const linkCommand: CommandModule = {
  command: 'link <path>',
  describe:
    'Links an extension from a local path. Updates made to the local path will always be reflected.',
  builder: (yargs) =>
    yargs
      .positional('path', {
        describe: 'The name of the extension to link.',
        type: 'string',
      })
      .option('consent', {
        describe:
          'Acknowledge the security risks of installing an extension and skip the confirmation prompt.',
        type: 'boolean',
        default: false,
      })
      .check((_) => true),
  handler: async (argv) => {
    await handleLink({
      path: argv['path'] as string,
      consent: argv['consent'] as boolean | undefined,
    });
    await exitCli();
  },
};
