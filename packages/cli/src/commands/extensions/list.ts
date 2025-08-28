/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  InstallLocation,
  loadExtensionsForLocation,
  toOutputString,
} from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';

export async function handleList() {
  try {
    const userExtensions = loadExtensionsForLocation(InstallLocation.User);
    const systemExtensions = loadExtensionsForLocation(InstallLocation.System);

    if (userExtensions.length === 0 && systemExtensions.length === 0) {
      console.log('No extensions installed.');
      return;
    }

    if (userExtensions.length > 0) {
      console.log('User Extensions:');
      console.log(
        userExtensions
          .map((extension) => toOutputString(extension))
          .join('\n\n'),
      );
    }

    if (systemExtensions.length > 0) {
      if (userExtensions.length > 0) {
        console.log('\n');
      }
      console.log('System Extensions:');
      console.log(
        systemExtensions
          .map((extension) => toOutputString(extension))
          .join('\n\n'),
      );
    }
  } catch (error) {
    console.error(getErrorMessage(error));
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'Lists installed extensions.',
  builder: (yargs) => yargs,
  handler: async () => {
    await handleList();
  },
};
