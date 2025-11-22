/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import type { ExtensionInstallMetadata } from '@google/gemini-cli-core';

export const installCommand: CommandModule = {
  command: 'install <source>',
  describe: 'Install a hook plugin (as an extension)',
  handler: async (argv) => {
    const source = argv.source as string;
    console.log(`Installing hook plugin from: ${source}`);

    const settings = loadSettings();
    const extensionManager = new ExtensionManager({
      workspaceDir: process.cwd(),
      settings: settings.merged,
      requestConsent: requestConsentNonInteractive,
      requestSetting: null,
    });

    await extensionManager.loadExtensions();

    let type: ExtensionInstallMetadata['type'] = 'git';
    if (source.startsWith('.') || source.startsWith('/')) {
      type = 'local';
    } else if (source.startsWith('http')) {
      type = 'git'; // Default to git for URLs
    } else {
      // Fallback or TODO: npm support?
      console.warn('Assuming git source for: ' + source);
    }

    const metadata: ExtensionInstallMetadata = {
      type,
      source,
    };

    try {
      const extension =
        await extensionManager.installOrUpdateExtension(metadata);
      console.log(`Successfully installed plugin: ${extension.name}`);

      if (extension.hooks) {
        const hookCount = Object.values(extension.hooks).flat().length;
        console.log(`Registered ${hookCount} hooks.`);
      } else {
        console.warn('No hooks found in this extension.');
      }
    } catch (error) {
      console.error('Failed to install plugin:', error);
      process.exit(1);
    }
    process.exit(0);
  },
};
