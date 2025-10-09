/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  installExtension,
  requestConsentNonInteractive,
} from '../../config/extension.js';
import type { ExtensionInstallMetadata } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { stat } from 'node:fs/promises';

interface InstallArgs {
  source: string;
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
}

export async function handleInstall(args: InstallArgs) {
  try {
    let installMetadata: ExtensionInstallMetadata;
    const { source } = args;
    if (
      source.startsWith('http://') ||
      source.startsWith('https://') ||
      source.startsWith('git@') ||
      source.startsWith('sso://')
    ) {
      installMetadata = {
        source,
        type: 'git',
        ref: args.ref,
        autoUpdate: args.autoUpdate,
        allowPreRelease: args.allowPreRelease,
      };
    } else {
      if (args.ref || args.autoUpdate) {
        throw new Error(
          '--ref and --auto-update are not applicable for local extensions.',
        );
      }
      try {
        await stat(source);
        installMetadata = {
          source,
          type: 'local',
        };
      } catch {
        throw new Error('Install source not found.');
      }
    }

    const name = await installExtension(
      installMetadata,
      requestConsentNonInteractive,
    );
    console.log(`Extension "${name}" installed successfully and enabled.`);
  } catch (error) {
    console.error(getErrorMessage(error));
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
    });
  },
};
