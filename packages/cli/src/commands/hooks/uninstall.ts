/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';

export const uninstallCommand: CommandModule = {
  command: 'uninstall <name>',
  describe: 'Uninstall a hook plugin',
  handler: async (argv) => {
    const name = argv['name'] as string;
    console.log(`Uninstalling hook plugin: ${name}`);

    const settings = loadSettings();
    const extensionManager = new ExtensionManager({
      workspaceDir: process.cwd(),
      settings: settings.merged,
      requestConsent: requestConsentNonInteractive,
      requestSetting: null,
    });

    await extensionManager.loadExtensions();

    try {
      await extensionManager.uninstallExtension(name, false);
      console.log(`Successfully uninstalled plugin: ${name}`);
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      throw error;
    }
  },
};
