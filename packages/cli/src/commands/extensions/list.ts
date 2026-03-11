/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger } from '@google/gemini-cli-core';
import { loadCliConfig, type CliArgs } from '../../config/config.js';
import { loadSettings } from '../../config/settings.js';
import type { ExtensionManager } from '../../config/extension-manager.js';
import { exitCli } from '../utils.js';
export async function handleList(
  argv: CliArgs,
  options?: { outputFormat?: 'text' | 'json' },
) {
  try {
    const workspaceDir = process.cwd();
    const settings = loadSettings(workspaceDir);
    const config = await loadCliConfig(
      settings.merged,
      'extensions-list-session',
      argv,
      { cwd: workspaceDir },
    );

    // Initialize to trigger extension loading (and profile filtering)
    await config.initialize();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const extensionManager = config.getExtensionLoader() as ExtensionManager;
    const extensions = extensionManager.getExtensions();
    if (extensions.length === 0) {
      if (options?.outputFormat === 'json') {
        debugLogger.log('[]');
      } else {
        debugLogger.log('No extensions installed.');
      }
      return;
    }

    if (options?.outputFormat === 'json') {
      debugLogger.log(JSON.stringify(extensions, null, 2));
    } else {
      debugLogger.log(
        extensions
          .map((extension, _): string =>
            extensionManager.toOutputString(extension),
          )
          .join('\n\n'),
      );
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'Lists installed extensions.',
  builder: (yargs) =>
    yargs.option('output-format', {
      alias: 'o',
      type: 'string',
      describe: 'The format of the CLI output.',
      choices: ['text', 'json'],
      default: 'text',
    }),
  handler: async (argv) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    await handleList(argv as unknown as CliArgs, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      outputFormat: argv['output-format'] as 'text' | 'json',
    });
    await exitCli();
  },
};
