/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Argv } from 'yargs';
import { installExtension } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';

const ORG_REPO_REGEX = /^[a-zA-Z0-9-]+\/[\w.-]+$/;

export const installCommand = {
  command: 'install',
  describe: 'Installs an extension from a local path or git repository.',
  builder: (yargs: Argv) => {
    return yargs
      .option('source', {
        alias: 's',
        type: 'string',
        description:
          'The git repository URL or `org/repo` abbreviation to install from.',
      })
      .option('path', {
        alias: 'p',
        type: 'string',
        description: 'The local path to install from.',
      })
      .check((argv) => {
        if (!argv.source && !argv.path) {
          throw new Error('Either source or --path must be provided.');
        }
        if (argv.source && argv.path) {
          throw new Error(
            'Arguments --source and --path are mutually exclusive. Please provide only one.',
          );
        }
        return true;
      });
  },
  handler: async (argv: { source?: string; path?: string }) => {
    try {
      await handleInstall(argv);
    } catch (error) {
      console.error(getErrorMessage(error));
      process.exit(1);
    }
  },
};

export async function handleInstall(argv: { source?: string; path?: string }) {
  let source = argv.source;
  if (source) {
    if (
      !source.startsWith('https://') &&
      !source.startsWith('http://') &&
      !source.startsWith('git@')
    ) {
      if (ORG_REPO_REGEX.test(source)) {
        source = `https://github.com/${source}.git`;
      } else {
        throw new Error(
          `The source "${source}" is not a valid URL or "org/repo" format.`,
        );
      }
    }
  }
  const extensionName = await installExtension({
    type: argv.path ? 'local' : 'git',
    source: source || argv.path!,
  });
  console.log(
    `Extension "${extensionName}" installed successfully and enabled.`,
  );
}