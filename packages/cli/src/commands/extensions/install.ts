/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { debugLogger } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import {
  INSTALL_WARNING_MESSAGE,
  requestConsentNonInteractive,
} from '../../config/extensions/consent.js';
import {
  ExtensionManager,
  inferInstallMetadata,
} from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface InstallArgs {
  source: string;
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
  consent?: boolean;
}

export async function handleInstall(args: InstallArgs) {
  try {
    const { source } = args;
    const installMetadata = await inferInstallMetadata(source, {
      ref: args.ref,
      autoUpdate: args.autoUpdate,
      allowPreRelease: args.allowPreRelease,
    });

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
      `Extension "${extension.name}" installed successfully and enabled.`,
    );
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const installCommand: CommandModule = {
  command: 'install <source> [--auto-update] [--pre-release]',
  describe: 'Installs an extension from a git repository URL or a local path.',
  builder: (yargs) =>
    yargs
      .positional('source', {
        describe: 'The github URL or local path of the extension to install.',
        type: 'string',
        demandOption: true,
      })
      .option('ref', {
        describe: 'The git ref to install from.',
        type: 'string',
      })
      .option('auto-update', {
        describe: 'Enable auto-update for this extension.',
        type: 'boolean',
      })
      .option('pre-release', {
        describe: 'Enable pre-release versions for this extension.',
        type: 'boolean',
      })
      .option('consent', {
        describe:
          'Acknowledge the security risks of installing an extension and skip the confirmation prompt.',
        type: 'boolean',
        default: false,
      })
      .check((argv) => {
        if (!argv.source) {
          throw new Error('The source argument must be provided.');
        }
        return true;
      }),
  handler: async (argv) => {
    await handleInstall({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      source: argv['source'] as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ref: argv['ref'] as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      autoUpdate: argv['auto-update'] as boolean | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      allowPreRelease: argv['pre-release'] as boolean | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      consent: argv['consent'] as boolean | undefined,
    });
    await exitCli();
  },
};
