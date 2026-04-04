/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { debugLogger, getErrorMessage } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';
import { exitCli } from '../utils.js';
import { getExtensionManager } from './utils.js';
import { McpServerEnablementManager } from '../../config/mcp/mcpServerEnablement.js';
import prompts from 'prompts';

interface SelectArgs {
  names?: string[];
  all?: boolean;
  none?: boolean;
  scope?: string;
}

export async function handleSelect(args: SelectArgs) {
  const extensionManager = await getExtensionManager();
  const extensions = extensionManager.getExtensions();

  if (extensions.length === 0) {
    debugLogger.log('No extensions installed.');
    return;
  }

  const scope =
    args.scope?.toLowerCase() === 'workspace'
      ? SettingScope.Workspace
      : SettingScope.User;

  let selectedNames: Set<string>;

  if (args.all) {
    selectedNames = new Set(extensions.map((e) => e.name));
  } else if (args.none) {
    selectedNames = new Set();
  } else if (args.names && args.names.length > 0) {
    // Non-interactive mode: validate provided names
    const installedNames = new Set(extensions.map((e) => e.name));
    const unknownNames = args.names.filter((n) => !installedNames.has(n));
    if (unknownNames.length > 0) {
      debugLogger.error(
        `Unknown extensions: ${unknownNames.join(', ')}. Use "gemini extensions list" to see installed extensions.`,
      );
      await exitCli(1);
    }
    selectedNames = new Set(args.names);
  } else {
    // Interactive mode: show pick list
    const choices = extensions.map((extension) => ({
      title: `${extension.name} (${extension.version})`,
      value: extension.name,
      selected: extension.isActive,
    }));

    const response = await prompts({
      type: 'multiselect',
      name: 'extensions',
      message:
        'Select extensions to enable (space to toggle, enter to confirm)',
      choices,
    });

    if (!response.extensions) {
      debugLogger.log('Selection cancelled.');
      return;
    }

    selectedNames = new Set<string>(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      response.extensions as string[],
    );
  }

  let enabledCount = 0;
  let disabledCount = 0;
  const mcpServersToEnable: string[] = [];

  try {
    for (const extension of extensions) {
      const wasActive = extension.isActive;
      const nowSelected = selectedNames.has(extension.name);

      if (!wasActive && nowSelected) {
        await extensionManager.enableExtension(extension.name, scope);
        if (extension.mcpServers) {
          mcpServersToEnable.push(...Object.keys(extension.mcpServers));
        }
        enabledCount++;
      } else if (wasActive && !nowSelected) {
        await extensionManager.disableExtension(extension.name, scope);
        disabledCount++;
      }
    }

    // Auto-enable any disabled MCP servers for newly enabled extensions
    if (mcpServersToEnable.length > 0) {
      const mcpEnablementManager = McpServerEnablementManager.getInstance();
      const enabledServers =
        await mcpEnablementManager.autoEnableServers(mcpServersToEnable);
      for (const serverName of enabledServers) {
        debugLogger.log(
          `MCP server '${serverName}' was disabled - now enabled.`,
        );
      }
    }

    if (enabledCount === 0 && disabledCount === 0) {
      debugLogger.log('No changes made.');
    } else {
      const parts: string[] = [];
      if (enabledCount > 0) {
        parts.push(`${enabledCount} enabled`);
      }
      if (disabledCount > 0) {
        parts.push(`${disabledCount} disabled`);
      }
      debugLogger.log(`Done: ${parts.join(', ')}.`);
    }
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    await exitCli(1);
  }
}

export const selectCommand: CommandModule = {
  command: 'select [names..] [--all] [--none]',
  describe:
    'Select which extensions to enable. Without arguments, shows an interactive picker.',
  builder: (yargs) =>
    yargs
      .positional('names', {
        describe:
          'Extension names to enable. All others will be disabled. If omitted, shows an interactive picker.',
        type: 'string',
        array: true,
      })
      .option('all', {
        type: 'boolean',
        describe: 'Enable all installed extensions.',
        default: false,
      })
      .option('none', {
        type: 'boolean',
        describe: 'Disable all installed extensions.',
        default: false,
      })
      .option('scope', {
        describe: 'The scope to apply changes in. Defaults to user scope.',
        type: 'string',
        default: SettingScope.User,
      })
      .check((argv) => {
        const flags = [
          argv.all && '--all',
          argv.none && '--none',
          argv.names && argv.names.length > 0 && 'names',
        ].filter(Boolean);
        if (flags.length > 1) {
          throw new Error(
            'Only one of --all, --none, or extension names may be provided.',
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
    await handleSelect({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      names: argv['names'] as string[] | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      all: argv['all'] as boolean,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      none: argv['none'] as boolean,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      scope: argv['scope'] as string,
    });
    await exitCli();
  },
};
