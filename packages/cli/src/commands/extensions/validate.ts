/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { ExtensionManager } from '../../config/extension-manager.js';
import { getContextFileNames } from '../../config/extension-manager.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import semver from 'semver';
import { getErrorMessage } from '../../utils/errors.js';
import { loadSettings } from '../../config/settings.js';

interface ValidateArgs {
  path?: string;
}

export async function handleValidation(args: ValidateArgs) {
  const CWD = args.path || process.cwd();
  console.log('Validating gemini-extensions.json...');

  try {
    const extensionManager = new ExtensionManager({
      workspaceDir: CWD,
      settings: loadSettings(CWD).merged,
      requestConsent: () => Promise.resolve(true),
      requestSetting: () => Promise.resolve(''),
    });
    const config = extensionManager.loadExtensionConfig(CWD);

    if (!semver.valid(config.version)) {
      throw new Error(`Invalid version: "${config.version}". Version must be in standard semver format.`);
    }

    const contextFiles = getContextFileNames(config);
    for (const file of contextFiles) {
      try {
        await fs.access(path.join(CWD, file));
      } catch {
        throw new Error(`Context file not found: ${file}`);
      }
    }

    console.log('Validation successful!');
  } catch (error) {
    console.error(`Validation failed: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

export const validateCommand: CommandModule = {
  command: 'validate',
  describe: 'Validates a gemini-extensions.json file.',
  builder: (yargs) => yargs,
  handler: async (argv) => {
    await handleValidation({});
  },
};
