/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadExtensions } from '../../config/extension.js';

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List all available extensions',
  handler: () => {
    const extensions = loadExtensions(process.cwd());
    console.log('Installed extensions:');
    for (const extension of extensions) {
      console.log(`- ${extension.config.name}`);
    }
  },
};
