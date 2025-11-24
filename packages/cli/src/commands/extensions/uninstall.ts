/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getErrorMessage } from '../../utils/errors.js';
import { debugLogger } from '@google/gemini-cli-core';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import {
  loadSettings,
  SettingScope,
  type LoadableSettingScope,
} from '../../config/settings.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

interface UninstallArgs {
  names: string[]; // can be extension names or source URLs.
}

export async function handleUninstall(args: UninstallArgs) {
  try {
    const workspaceDir = process.cwd();
    const loadedSettings = loadSettings(workspaceDir);
    const extensionManager = new ExtensionManager({
      workspaceDir,
      requestConsent: requestConsentNonInteractive,
      requestSetting: promptForSetting,
      settings: loadedSettings.merged,
    });
    await extensionManager.loadExtensions();

    const errors: Array<{ name: string; error: string }> = [];
    for (const name of [...new Set(args.names)]) {
      try {
        await extensionManager.uninstallExtension(name, false);
        debugLogger.log(`Extension "${name}" successfully uninstalled.`);

        // Also remove any MCP server config for this extension
        const scopes: LoadableSettingScope[] = [
          SettingScope.User,
          SettingScope.Workspace,
        ];
        for (const scope of scopes) {
          const settings = loadedSettings.forScope(scope).settings;
          if (settings.mcpServers && settings.mcpServers[name]) {
            const newMcpServers = { ...settings.mcpServers };
            delete newMcpServers[name];
            loadedSettings.setValue(scope, 'mcpServers', newMcpServers);
            debugLogger.log(
              `Removed MCP server configuration for "${name}" from ${scope} settings.`,
            );
          }
        }
      } catch (error) {
        errors.push({ name, error: getErrorMessage(error) });
      }
    }

    if (errors.length > 0) {
      for (const { name, error } of errors) {
        debugLogger.error(`Failed to uninstall "${name}": ${error}`);
      }
      process.exit(1);
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const uninstallCommand: CommandModule = {
  command: 'uninstall <names..>',
  describe: 'Uninstalls one or more extensions.',
  builder: (yargs) =>
    yargs
      .positional('names', {
        describe:
          'The name(s) or source path(s) of the extension(s) to uninstall.',
        type: 'string',
        array: true,
      })
      .check((argv) => {
        if (!argv.names || (argv.names as string[]).length === 0) {
          throw new Error(
            'Please include at least one extension name to uninstall as a positional argument.',
          );
        }
        return true;
      }),
  handler: async (argv) => {
    await handleUninstall({
      names: argv['names'] as string[],
    });
    await exitCli();
  },
};
