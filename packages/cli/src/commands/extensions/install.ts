/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Argv, CommandModule } from 'yargs';
import {
  debugLogger,
  type ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { stat } from 'node:fs/promises';
import {
  INSTALL_WARNING_MESSAGE,
  requestConsentNonInteractive,
} from '../../config/extensions/consent.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';

// Regular expression to match 'org/repo' format.
const ORG_REPO_REGEX = /^[a-zA-Z0-9-]+\/[\w.-]+$/;

// Defines the shape of the arguments for the install command.
interface InstallArgs {
  source: string;
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
  consent?: boolean;
}

/**
 * Handles the logic for installing an extension based on the provided arguments.
 * @param args - The installation arguments.
 */
export async function handleInstall(args: InstallArgs) {
  try {
    let installMetadata: ExtensionInstallMetadata;
    let { source } = args;

    if (
      source.startsWith('http://') ||
      source.startsWith('https://') ||
      source.startsWith('git@') ||
      source.startsWith('sso://')
    ) {
      // It's a full URL
      installMetadata = {
        source,
        type: 'git',
        ref: args.ref,
        autoUpdate: args.autoUpdate,
        allowPreRelease: args.allowPreRelease,
      };
    } else if (ORG_REPO_REGEX.test(source)) {
      // It's an 'org/repo' shorthand
      source = `https://github.com/${source}.git`;
      installMetadata = {
        source,
        type: 'git',
        ref: args.ref,
        autoUpdate: args.autoUpdate,
        allowPreRelease: args.allowPreRelease,
      };
    } else {
      // Assume it's a local path and check
      if (args.ref || args.autoUpdate || args.allowPreRelease) {
        throw new Error(
          '--ref, --auto-update, and --pre-release are not applicable for local extensions.',
        );
      }
      try {
        await stat(source);
        installMetadata = {
          source,
          type: 'local',
        };
      } catch {
        throw new Error(
          `Install source "${source}" not found or is not a valid URL, 'org/repo' format, or local path.`,
        );
      }
    }

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
  describe:
    'Installs an extension from a git repo (URL or `org/repo`) or a local path.',
  builder: (yargs) =>
    yargs
      .positional('source', {
        describe:
          'The git URL, `org/repo` shorthand, or local path of the extension to install.',
        type: 'string',
        demandOption: true,
      })
      .option('ref', {
        describe: 'The git ref (branch, tag, or commit) to install from.',
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
      source: argv['source'] as string,
      ref: argv['ref'] as string | undefined,
      autoUpdate: argv['auto-update'] as boolean | undefined,
      allowPreRelease: argv['pre-release'] as boolean | undefined,
      consent: argv['consent'] as boolean | undefined,
    });
  },
};