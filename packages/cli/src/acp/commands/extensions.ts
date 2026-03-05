/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { listExtensions } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';
import {
  ExtensionManager,
  inferInstallMetadata,
} from '../../config/extension-manager.js';
import { getErrorMessage } from '../../utils/errors.js';
import { McpServerEnablementManager } from '../../config/mcp/mcpServerEnablement.js';
import { stat } from 'node:fs/promises';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import type { Config } from '@google/gemini-cli-core';

export class ExtensionsCommand implements Command {
  readonly name = 'extensions';
  readonly description = 'Manage extensions.';
  readonly subCommands = [
    new ListExtensionsCommand(),
    new ExploreExtensionsCommand(),
    new EnableExtensionCommand(),
    new DisableExtensionCommand(),
    new InstallExtensionCommand(),
    new LinkExtensionCommand(),
    new UninstallExtensionCommand(),
    new RestartExtensionCommand(),
    new UpdateExtensionCommand(),
  ];

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    return new ListExtensionsCommand().execute(context, _);
  }
}

export class ListExtensionsCommand implements Command {
  readonly name = 'extensions list';
  readonly description = 'Lists all installed extensions.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const extensions = listExtensions(context.config);
    const data = extensions.length ? extensions : 'No extensions installed.';

    return { name: this.name, data };
  }
}

export class ExploreExtensionsCommand implements Command {
  readonly name = 'extensions explore';
  readonly description = 'Explore available extensions.';

  async execute(
    _context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const extensionsUrl = 'https://geminicli.com/extensions/';
    return {
      name: this.name,
      data: `View or install available extensions at ${extensionsUrl}`,
    };
  }
}

function getEnableDisableContext(
  config: Config,
  args: string[],
  invocationName: string,
) {
  const extensionManager = config.getExtensionLoader();
  if (!(extensionManager instanceof ExtensionManager)) {
    return {
      error: `Cannot ${invocationName} extensions in this environment.`,
    };
  }

  if (args.length === 0) {
    return {
      error: `Usage: /extensions ${invocationName} <extension> [--scope=<user|workspace|session>]`,
    };
  }

  let scope = SettingScope.User;
  if (args.includes('--scope=workspace') || args.includes('workspace')) {
    scope = SettingScope.Workspace;
  } else if (args.includes('--scope=session') || args.includes('session')) {
    scope = SettingScope.Session;
  }

  const name = args.filter(
    (a) =>
      !a.startsWith('--scope') && !['user', 'workspace', 'session'].includes(a),
  )[0];

  let names: string[] = [];
  if (name === '--all') {
    let extensions = extensionManager.getExtensions();
    if (invocationName === 'enable') {
      extensions = extensions.filter((ext) => !ext.isActive);
    }
    if (invocationName === 'disable') {
      extensions = extensions.filter((ext) => ext.isActive);
    }
    names = extensions.map((ext) => ext.name);
  } else if (name) {
    names = [name];
  } else {
    return { error: 'No extension name provided.' };
  }

  return { extensionManager, names, scope };
}

export class EnableExtensionCommand implements Command {
  readonly name = 'extensions enable';
  readonly description = 'Enable an extension.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const enableContext = getEnableDisableContext(
      context.config,
      args,
      'enable',
    );
    if ('error' in enableContext) {
      return { name: this.name, data: enableContext.error };
    }

    const { names, scope, extensionManager } = enableContext;
    const output: string[] = [];

    for (const name of names) {
      try {
        await extensionManager.enableExtension(name, scope);
        output.push(`Extension "${name}" enabled for scope "${scope}".`);

        const extension = extensionManager
          .getExtensions()
          .find((e) => e.name === name);

        if (extension?.mcpServers) {
          const mcpEnablementManager = McpServerEnablementManager.getInstance();
          const mcpClientManager = context.config.getMcpClientManager();
          const enabledServers = await mcpEnablementManager.autoEnableServers(
            Object.keys(extension.mcpServers),
          );

          if (mcpClientManager && enabledServers.length > 0) {
            const restartPromises = enabledServers.map((serverName) =>
              mcpClientManager.restartServer(serverName).catch((error) => {
                output.push(
                  `Failed to restart MCP server '${serverName}': ${getErrorMessage(error)}`,
                );
              }),
            );
            await Promise.all(restartPromises);
            output.push(`Re-enabled MCP servers: ${enabledServers.join(', ')}`);
          }
        }
      } catch (e) {
        output.push(`Failed to enable "${name}": ${getErrorMessage(e)}`);
      }
    }

    return { name: this.name, data: output.join('\n') || 'No action taken.' };
  }
}

export class DisableExtensionCommand implements Command {
  readonly name = 'extensions disable';
  readonly description = 'Disable an extension.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const enableContext = getEnableDisableContext(
      context.config,
      args,
      'disable',
    );
    if ('error' in enableContext) {
      return { name: this.name, data: enableContext.error };
    }

    const { names, scope, extensionManager } = enableContext;
    const output: string[] = [];

    for (const name of names) {
      try {
        await extensionManager.disableExtension(name, scope);
        output.push(`Extension "${name}" disabled for scope "${scope}".`);
      } catch (e) {
        output.push(`Failed to disable "${name}": ${getErrorMessage(e)}`);
      }
    }

    return { name: this.name, data: output.join('\n') || 'No action taken.' };
  }
}

export class InstallExtensionCommand implements Command {
  readonly name = 'extensions install';
  readonly description = 'Install an extension from a git repo or local path.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const extensionLoader = context.config.getExtensionLoader();
    if (!(extensionLoader instanceof ExtensionManager)) {
      return {
        name: this.name,
        data: 'Cannot install extensions in this environment.',
      };
    }

    const source = args.join(' ').trim();
    if (!source) {
      return { name: this.name, data: `Usage: /extensions install <source>` };
    }

    if (/[;&|`'"]/.test(source)) {
      return {
        name: this.name,
        data: `Invalid source: contains disallowed characters.`,
      };
    }

    try {
      const installMetadata = await inferInstallMetadata(source);
      const extension =
        await extensionLoader.installOrUpdateExtension(installMetadata);
      return {
        name: this.name,
        data: `Extension "${extension.name}" installed successfully.`,
      };
    } catch (error) {
      return {
        name: this.name,
        data: `Failed to install extension from "${source}": ${getErrorMessage(error)}`,
      };
    }
  }
}

export class LinkExtensionCommand implements Command {
  readonly name = 'extensions link';
  readonly description = 'Link an extension from a local path.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const extensionLoader = context.config.getExtensionLoader();
    if (!(extensionLoader instanceof ExtensionManager)) {
      return {
        name: this.name,
        data: 'Cannot link extensions in this environment.',
      };
    }

    const sourceFilepath = args.join(' ').trim();
    if (!sourceFilepath) {
      return { name: this.name, data: `Usage: /extensions link <source>` };
    }

    try {
      await stat(sourceFilepath);
    } catch (_error) {
      return { name: this.name, data: `Invalid source: ${sourceFilepath}` };
    }

    try {
      const extension = await extensionLoader.installOrUpdateExtension({
        source: sourceFilepath,
        type: 'link',
      });
      return {
        name: this.name,
        data: `Extension "${extension.name}" linked successfully.`,
      };
    } catch (error) {
      return {
        name: this.name,
        data: `Failed to link extension: ${getErrorMessage(error)}`,
      };
    }
  }
}

export class UninstallExtensionCommand implements Command {
  readonly name = 'extensions uninstall';
  readonly description = 'Uninstall an extension.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const extensionLoader = context.config.getExtensionLoader();
    if (!(extensionLoader instanceof ExtensionManager)) {
      return {
        name: this.name,
        data: 'Cannot uninstall extensions in this environment.',
      };
    }

    const name = args.join(' ').trim();
    if (!name) {
      return {
        name: this.name,
        data: `Usage: /extensions uninstall <extension-name>`,
      };
    }

    try {
      await extensionLoader.uninstallExtension(name, false);
      return {
        name: this.name,
        data: `Extension "${name}" uninstalled successfully.`,
      };
    } catch (error) {
      return {
        name: this.name,
        data: `Failed to uninstall extension "${name}": ${getErrorMessage(error)}`,
      };
    }
  }
}

export class RestartExtensionCommand implements Command {
  readonly name = 'extensions restart';
  readonly description = 'Restart an extension.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const extensionLoader = context.config.getExtensionLoader();
    if (!(extensionLoader instanceof ExtensionManager)) {
      return { name: this.name, data: 'Cannot restart extensions.' };
    }

    const all = args.includes('--all');
    const names = all ? null : args.filter((a) => !!a);

    if (!all && names?.length === 0) {
      return {
        name: this.name,
        data: 'Usage: /extensions restart <extension-names>|--all',
      };
    }

    let extensionsToRestart = extensionLoader
      .getExtensions()
      .filter((e) => e.isActive);
    if (names) {
      extensionsToRestart = extensionsToRestart.filter((e) =>
        names.includes(e.name),
      );
    }

    if (extensionsToRestart.length === 0) {
      return {
        name: this.name,
        data: 'No active extensions matched the request.',
      };
    }

    const output: string[] = [];
    for (const extension of extensionsToRestart) {
      try {
        await extensionLoader.restartExtension(extension);
        output.push(`Restarted "${extension.name}".`);
      } catch (e) {
        output.push(
          `Failed to restart "${extension.name}": ${getErrorMessage(e)}`,
        );
      }
    }

    return { name: this.name, data: output.join('\n') };
  }
}

export class UpdateExtensionCommand implements Command {
  readonly name = 'extensions update';
  readonly description = 'Update an extension.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const extensionLoader = context.config.getExtensionLoader();
    if (!(extensionLoader instanceof ExtensionManager)) {
      return { name: this.name, data: 'Cannot update extensions.' };
    }

    const all = args.includes('--all');
    const names = all ? null : args.filter((a) => !!a);

    if (!all && names?.length === 0) {
      return {
        name: this.name,
        data: 'Usage: /extensions update <extension-names>|--all',
      };
    }

    return {
      name: this.name,
      data: 'Headless extension updating requires internal UI dispatches. Please use `gemini extensions update` directly in the terminal.',
    };
  }
}
