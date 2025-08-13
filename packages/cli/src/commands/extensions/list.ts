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

    if (annotatedExtensions.length === 0) {
      console.log('No extensions installed.');
      return;
    }

    const nameHeader = 'Name';
    const enabledHeader = 'Enabled';

    const nameWidth = Math.max(
      nameHeader.length,
      ...annotatedExtensions.map((ext) => ext.name.length),
    );

    console.log(`${nameHeader.padEnd(nameWidth)} | ${enabledHeader}`);
    console.log(
      `${'-'.repeat(nameWidth)} | ${'-'.repeat(enabledHeader.length)}`,
    );

    for (const extension of annotatedExtensions) {
      const { name, isActive } = extension;
      console.log(`${name.padEnd(nameWidth)} | ${isActive}`);
    }
  },
};
