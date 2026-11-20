/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { debugLogger, getErrorMessage } from '@google/gemini-cli-core';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';
import { McpServerEnablementManager } from '../../config/mcp/mcpServerEnablement.js';

interface EnableArgs {
  names?: string[];
  all?: boolean;
  scope?: string;
}

export async function handleEnable(args: EnableArgs) {
  const workingDir = process.cwd();
  const extensionManager = new ExtensionManager({
    workspaceDir: workingDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    settings: loadSettings(workingDir).merged,
  });
  await extensionManager.loadExtensions();

  const scope =
    args.scope?.toLowerCase() === 'workspace'
      ? SettingScope.Workspace
      : SettingScope.User;

  let namesToEnable: string[] = [];
  if (args.all) {
    namesToEnable = extensionManager.getExtensions().map((ext) => ext.name);
  } else if (args.names) {
    namesToEnable = [...new Set(args.names)];
  }

  if (namesToEnable.length === 0) {
    if (args.all) {
      debugLogger.log('No extensions currently installed.');
    }
    return;
  }

  const errors: Array<{ name: string; error: string }> = [];
  const mcpServersToEnable: string[] = [];

  for (const name of namesToEnable) {
    try {
      await extensionManager.enableExtension(name, scope);

      const extension = extensionManager
        .getExtensions()
        .find((e) => e.name === name);
      if (extension?.mcpServers) {
        mcpServersToEnable.push(...Object.keys(extension.mcpServers));
      }

      if (args.scope) {
        debugLogger.log(
          `Extension "${name}" successfully enabled for scope "${args.scope}".`,
        );
      } else {
        debugLogger.log(
          `Extension "${name}" successfully enabled in all scopes.`,
        );
      }
    } catch (error) {
      errors.push({ name, error: getErrorMessage(error) });
    }
  }

  // Auto-enable any disabled MCP servers for newly enabled extensions.
  if (mcpServersToEnable.length > 0) {
    const mcpEnablementManager = McpServerEnablementManager.getInstance();
    const enabledServers =
      await mcpEnablementManager.autoEnableServers(mcpServersToEnable);
    for (const serverName of enabledServers) {
      debugLogger.log(`MCP server '${serverName}' was disabled - now enabled.`);
    }
    // Note: No restartServer() - CLI exits immediately, servers load on next session
  }

  if (errors.length > 0) {
    for (const { name, error } of errors) {
      debugLogger.error(`Failed to enable "${name}": ${error}`);
    }
    await exitCli(1);
  }
}

export const enableCommand: CommandModule = {
  command: 'enable [names..]',
  describe: 'Enables one or more extensions.',
  builder: (yargs) =>
    yargs
      .positional('names', {
        describe: 'The name(s) of the extension(s) to enable.',
        type: 'string',
        array: true,
      })
      .option('all', {
        type: 'boolean',
        describe: 'Enable all installed extensions.',
        default: false,
      })
      .option('scope', {
        describe:
          'The scope to enable the extension in. If not set, will be enabled in all scopes.',
        type: 'string',
      })
      .check((argv) => {
        if (!argv.all && (!argv.names || argv.names.length === 0)) {
          throw new Error(
            'Please include at least one extension name to enable as a positional argument, or use the --all flag.',
          );
        }
        if (
          argv.scope &&
          !Object.values(SettingScope)
            .map((s) => s.toLowerCase())
            .includes(argv.scope.toLowerCase())
        ) {
          throw new Error(
            `Invalid scope: ${argv.scope}. Please use one of ${Object.values(
              SettingScope,
            )
              .map((s) => s.toLowerCase())
              .join(', ')}.`,
          );
        }
        return true;
      }),
  handler: async (argv) => {
    const rawNames = argv['names'];
    const names =
      rawNames === undefined
        ? undefined
        : Array.isArray(rawNames)
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (rawNames as string[])
          : [String(rawNames)];
    await handleEnable({
      names,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      all: argv['all'] as boolean,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      scope: argv['scope'] as string,
    });
    await exitCli();
  },
};
