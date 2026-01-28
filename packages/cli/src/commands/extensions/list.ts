/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger } from '@google/gemini-cli-core';
import { ExtensionManager } from '../../config/extension-manager.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { loadSettings } from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

export async function handleList(options?: { outputFormat?: 'text' | 'json' }) {
  try {
    const workspaceDir = process.cwd();
    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent: requestConsentNonInteractive,
      requestSetting: promptForSetting,
      settings: loadSettings(workspaceDir).merged,
    });
    const extensions = await extensionManager.loadExtensions();
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
    await handleList({
      outputFormat: argv['output-format'] as 'text' | 'json',
    });
    await exitCli();
  },
};
