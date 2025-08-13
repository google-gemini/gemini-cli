/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  loadExtensions,
  annotateActiveExtensionsFromDisabled,
} from '../../config/extension.js';
import { loadSettings } from '../../config/settings.js';

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List all available extensions',
  handler: () => {
    const workspaceRoot = process.cwd();
    const settings = loadSettings(workspaceRoot);
    const extensions = loadExtensions(workspaceRoot);
    const annotatedExtensions = annotateActiveExtensionsFromDisabled(
      extensions,
      settings.merged.extensions?.disabled || [],
    );
    console.log('Installed extensions:');
    for (const extension of annotatedExtensions) {
      console.log(`- ${extension.name}`);
    }
  },
};
