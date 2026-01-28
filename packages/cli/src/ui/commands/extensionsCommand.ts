/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  debugLogger,
  listExtensions,
  type ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import { t } from '../../i18n/index.js';
import type { ExtensionUpdateInfo } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import {
  emptyIcon,
  MessageType,
  type HistoryItemExtensionsList,
  type HistoryItemInfo,
} from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import open from 'open';
import process from 'node:process';
import {
  ExtensionManager,
  inferInstallMetadata,
} from '../../config/extension-manager.js';
import { SettingScope } from '../../config/settings.js';
import { McpServerEnablementManager } from '../../config/mcp/mcpServerEnablement.js';
import { theme } from '../semantic-colors.js';
import { stat } from 'node:fs/promises';

function showMessageIfNoExtensions(
  context: CommandContext,
  extensions: unknown[],
): boolean {
  if (extensions.length === 0) {
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.noExtensions'),
    });
    return true;
  }
  return false;
}

async function listAction(context: CommandContext) {
  const extensions = context.services.config
    ? listExtensions(context.services.config)
    : [];

  if (showMessageIfNoExtensions(context, extensions)) {
    return;
  }

  const historyItem: HistoryItemExtensionsList = {
    type: MessageType.EXTENSIONS_LIST,
    extensions,
  };

  context.ui.addItem(historyItem);
}

function updateAction(context: CommandContext, args: string): Promise<void> {
  const updateArgs = args.split(' ').filter((value) => value.length > 0);
  const all = updateArgs.length === 1 && updateArgs[0] === '--all';
  const names = all ? null : updateArgs;

  if (!all && names?.length === 0) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.usageUpdate'),
    });
    return Promise.resolve();
  }

  let resolveUpdateComplete: (updateInfo: ExtensionUpdateInfo[]) => void;
  const updateComplete = new Promise<ExtensionUpdateInfo[]>(
    (resolve) => (resolveUpdateComplete = resolve),
  );

  const extensions = context.services.config
    ? listExtensions(context.services.config)
    : [];

  if (showMessageIfNoExtensions(context, extensions)) {
    return Promise.resolve();
  }

  const historyItem: HistoryItemExtensionsList = {
    type: MessageType.EXTENSIONS_LIST,
    extensions,
  };

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  updateComplete.then((updateInfos) => {
    if (updateInfos.length === 0) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: t('commands:extensions.responses.noUpdates'),
      });
    }

    context.ui.addItem(historyItem);
    context.ui.setPendingItem(null);
  });

  try {
    context.ui.setPendingItem(historyItem);

    context.ui.dispatchExtensionStateUpdate({
      type: 'SCHEDULE_UPDATE',
      payload: {
        all,
        names,
        onComplete: (updateInfos) => {
          resolveUpdateComplete(updateInfos);
        },
      },
    });
    if (names?.length) {
      const extensions = listExtensions(context.services.config!);
      for (const name of names) {
        const extension = extensions.find(
          (extension) => extension.name === name,
        );
        if (!extension) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: t('commands:extensions.responses.notFound', { name }),
          });
          continue;
        }
      }
    }
  } catch (error) {
    resolveUpdateComplete!([]);
    context.ui.addItem({
      type: MessageType.ERROR,
      text: getErrorMessage(error),
    });
  }
  return updateComplete.then((_) => {});
}

async function restartAction(
  context: CommandContext,
  args: string,
): Promise<void> {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!extensionLoader) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.loaderNotReady'),
    });
    return;
  }

  const extensions = extensionLoader.getExtensions();
  if (showMessageIfNoExtensions(context, extensions)) {
    return;
  }

  const restartArgs = args.split(' ').filter((value) => value.length > 0);
  const all = restartArgs.length === 1 && restartArgs[0] === '--all';
  const names = all ? null : restartArgs;
  if (!all && names?.length === 0) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.usageRestart'),
    });
    return Promise.resolve();
  }

  let extensionsToRestart = extensionLoader
    .getExtensions()
    .filter((extension) => extension.isActive);
  if (names) {
    extensionsToRestart = extensionsToRestart.filter((extension) =>
      names.includes(extension.name),
    );
    if (names.length !== extensionsToRestart.length) {
      const notFound = names.filter(
        (name) =>
          !extensionsToRestart.some((extension) => extension.name === name),
      );
      if (notFound.length > 0) {
        context.ui.addItem({
          type: MessageType.WARNING,
          text: t('commands:extensions.responses.notFoundOrActive', {
            names: notFound.join(', '),
          }),
        });
      }
    }
  }
  if (extensionsToRestart.length === 0) {
    // We will have logged a different message above already.
    return;
  }

  const restartingMessage = {
    type: MessageType.INFO,
    text: t('commands:extensions.responses.restarting', {
      count: extensionsToRestart.length,
    }),
    color: theme.text.primary,
  };
  context.ui.addItem(restartingMessage);

  const results = await Promise.allSettled(
    extensionsToRestart.map(async (extension) => {
      if (extension.isActive) {
        await extensionLoader.restartExtension(extension);
        context.ui.dispatchExtensionStateUpdate({
          type: 'RESTARTED',
          payload: {
            name: extension.name,
          },
        });
      }
    }),
  );

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failures.length > 0) {
    const errorMessages = failures
      .map((failure, index) => {
        const extensionName = extensionsToRestart[index].name;
        return `${extensionName}: ${getErrorMessage(failure.reason)}`;
      })
      .join('\n  ');
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.restartFailed', {
        errors: errorMessages,
      }),
    });
  } else {
    const infoItem: HistoryItemInfo = {
      type: MessageType.INFO,
      text: t('commands:extensions.responses.restartSuccess', {
        count: extensionsToRestart.length,
      }),
      icon: emptyIcon,
      color: theme.text.primary,
    };
    context.ui.addItem(infoItem);
  }
}

async function exploreAction(context: CommandContext) {
  const extensionsUrl = 'https://geminicli.com/extensions/';

  // Only check for NODE_ENV for explicit test mode, not for unit test framework
  if (process.env['NODE_ENV'] === 'test') {
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.exploreTest', {
        url: extensionsUrl,
      }),
    });
  } else if (
    process.env['SANDBOX'] &&
    process.env['SANDBOX'] !== 'sandbox-exec'
  ) {
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.exploreSandbox', {
        url: extensionsUrl,
      }),
    });
  } else {
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.exploreOpening', {
        url: extensionsUrl,
      }),
    });
    try {
      await open(extensionsUrl);
    } catch (_error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: t('commands:extensions.responses.exploreFailed', {
          url: extensionsUrl,
        }),
      });
    }
  }
}

function getEnableDisableContext(
  context: CommandContext,
  argumentsString: string,
): {
  extensionManager: ExtensionManager;
  names: string[];
  scope: SettingScope;
} | null {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error(
      `Cannot ${context.invocation?.name} extensions in this environment`,
    );
    return null;
  }
  const parts = argumentsString.split(' ');
  const name = parts[0];
  if (
    name === '' ||
    !(
      (parts.length === 2 && parts[1].startsWith('--scope=')) || // --scope=<scope>
      (parts.length === 3 && parts[1] === '--scope') // --scope <scope>
    )
  ) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.usageEnableDisable', {
        command: context.invocation?.name,
      }),
    });
    return null;
  }
  let scope: SettingScope;
  // Transform `--scope=<scope>` to `--scope <scope>`.
  if (parts.length === 2) {
    parts.push(...parts[1].split('='));
    parts.splice(1, 1);
  }
  switch (parts[2].toLowerCase()) {
    case 'workspace':
      scope = SettingScope.Workspace;
      break;
    case 'user':
      scope = SettingScope.User;
      break;
    case 'session':
      scope = SettingScope.Session;
      break;
    default:
      context.ui.addItem({
        type: MessageType.ERROR,
        text: t('commands:extensions.responses.unsupportedScope', {
          scope: parts[2],
        }),
      });
      debugLogger.error();
      return null;
  }
  let names: string[] = [];
  if (name === '--all') {
    let extensions = extensionLoader.getExtensions();
    if (context.invocation?.name === 'enable') {
      extensions = extensions.filter((ext) => !ext.isActive);
    }
    if (context.invocation?.name === 'disable') {
      extensions = extensions.filter((ext) => ext.isActive);
    }
    names = extensions.map((ext) => ext.name);
  } else {
    names = [name];
  }

  return {
    extensionManager: extensionLoader,
    names,
    scope,
  };
}

async function disableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { names, scope, extensionManager } = enableContext;
  for (const name of names) {
    await extensionManager.disableExtension(name, scope);
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.disabled', { name, scope }),
    });
  }
}

async function enableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { names, scope, extensionManager } = enableContext;
  for (const name of names) {
    await extensionManager.enableExtension(name, scope);
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.enabled', { name, scope }),
    });

    // Auto-enable any disabled MCP servers for this extension
    const extension = extensionManager
      .getExtensions()
      .find((e) => e.name === name);

    if (extension?.mcpServers) {
      const mcpEnablementManager = McpServerEnablementManager.getInstance();
      const mcpClientManager = context.services.config?.getMcpClientManager();
      const enabledServers = await mcpEnablementManager.autoEnableServers(
        Object.keys(extension.mcpServers ?? {}),
      );

      if (mcpClientManager && enabledServers.length > 0) {
        const restartPromises = enabledServers.map((serverName) =>
          mcpClientManager.restartServer(serverName).catch((error) => {
            context.ui.addItem({
              type: MessageType.WARNING,
              text: `Failed to restart MCP server '${serverName}': ${getErrorMessage(error)}`,
            });
          }),
        );
        await Promise.all(restartPromises);
      }

      if (enabledServers.length > 0) {
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Re-enabled MCP servers: ${enabledServers.join(', ')}`,
        });
      }
    }
  }
}

async function installAction(context: CommandContext, args: string) {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error(
      `Cannot ${context.invocation?.name} extensions in this environment`,
    );
    return;
  }

  const source = args.trim();
  if (!source) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.usageInstall'),
    });
    return;
  }

  // Validate that the source is either a valid URL or a valid file path.
  let isValid = false;
  try {
    // Check if it's a valid URL.
    new URL(source);
    isValid = true;
  } catch {
    // If not a URL, check for characters that are disallowed in file paths
    // and could be used for command injection.
    if (!/[;&|`'"]/.test(source)) {
      isValid = true;
    }
  }

  if (!isValid) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.invalidSource', { source }),
    });
    return;
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: t('commands:extensions.responses.installing', { source }),
  });

  try {
    const installMetadata = await inferInstallMetadata(source);
    const extension =
      await extensionLoader.installOrUpdateExtension(installMetadata);
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.installSuccess', {
        name: extension.name,
      }),
    });
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.installFailed', {
        source,
        error: getErrorMessage(error),
      }),
    });
  }
}

async function linkAction(context: CommandContext, args: string) {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error(
      `Cannot ${context.invocation?.name} extensions in this environment`,
    );
    return;
  }

  const sourceFilepath = args.trim();
  if (!sourceFilepath) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.usageLink'),
    });
    return;
  }
  if (/[;&|`'"]/.test(sourceFilepath)) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.invalidLinkSource', {
        source: sourceFilepath,
      }),
    });
    return;
  }

  try {
    await stat(sourceFilepath);
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.invalidLinkSource', {
        source: sourceFilepath,
      }),
    });
    debugLogger.error(
      `Failed to stat path "${sourceFilepath}": ${getErrorMessage(error)}`,
    );
    return;
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: t('commands:extensions.responses.linking', {
      source: sourceFilepath,
    }),
  });

  try {
    const installMetadata: ExtensionInstallMetadata = {
      source: sourceFilepath,
      type: 'link',
    };
    const extension =
      await extensionLoader.installOrUpdateExtension(installMetadata);
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.linkSuccess', {
        name: extension.name,
      }),
    });
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.linkFailed', {
        source: sourceFilepath,
        error: getErrorMessage(error),
      }),
    });
  }
}

async function uninstallAction(context: CommandContext, args: string) {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error(
      `Cannot ${context.invocation?.name} extensions in this environment`,
    );
    return;
  }

  const name = args.trim();
  if (!name) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.usageUninstall'),
    });
    return;
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: t('commands:extensions.responses.uninstalling', { name }),
  });

  try {
    await extensionLoader.uninstallExtension(name, false);
    context.ui.addItem({
      type: MessageType.INFO,
      text: t('commands:extensions.responses.uninstallSuccess', { name }),
    });
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:extensions.responses.uninstallFailed', {
        name,
        error: getErrorMessage(error),
      }),
    });
  }
}

/**
 * Exported for testing.
 */
export function completeExtensions(
  context: CommandContext,
  partialArg: string,
) {
  let extensions = context.services.config?.getExtensions() ?? [];

  if (context.invocation?.name === 'enable') {
    extensions = extensions.filter((ext) => !ext.isActive);
  }
  if (
    context.invocation?.name === 'disable' ||
    context.invocation?.name === 'restart'
  ) {
    extensions = extensions.filter((ext) => ext.isActive);
  }
  const extensionNames = extensions.map((ext) => ext.name);
  const suggestions = extensionNames.filter((name) =>
    name.startsWith(partialArg),
  );

  if ('--all'.startsWith(partialArg) || 'all'.startsWith(partialArg)) {
    suggestions.unshift('--all');
  }

  return suggestions;
}

export function completeExtensionsAndScopes(
  context: CommandContext,
  partialArg: string,
) {
  return completeExtensions(context, partialArg).flatMap((s) => [
    `${s} --scope user`,
    `${s} --scope workspace`,
    `${s} --scope session`,
  ]);
}

const listExtensionsCommand: SlashCommand = {
  name: 'list',
  description: 'List active extensions',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: listAction,
};

const updateExtensionsCommand: SlashCommand = {
  name: 'update',
  description: 'Update extensions. Usage: update <extension-names>|--all',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: updateAction,
  completion: completeExtensions,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable an extension',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: disableAction,
  completion: completeExtensionsAndScopes,
};

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable an extension',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: enableAction,
  completion: completeExtensionsAndScopes,
};

const installCommand: SlashCommand = {
  name: 'install',
  description: 'Install an extension from a git repo or local path',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: installAction,
};

const linkCommand: SlashCommand = {
  name: 'link',
  description: 'Link an extension from a local path',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: linkAction,
};

const uninstallCommand: SlashCommand = {
  name: 'uninstall',
  description: 'Uninstall an extension',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: uninstallAction,
  completion: completeExtensions,
};

const exploreExtensionsCommand: SlashCommand = {
  name: 'explore',
  description: 'Open extensions page in your browser',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: exploreAction,
};

const restartCommand: SlashCommand = {
  name: 'restart',
  description: 'Restart all extensions',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: restartAction,
  completion: completeExtensions,
};

export function extensionsCommand(
  enableExtensionReloading?: boolean,
): SlashCommand {
  const conditionalCommands = enableExtensionReloading
    ? [
        disableCommand,
        enableCommand,
        installCommand,
        uninstallCommand,
        linkCommand,
      ]
    : [];
  return {
    name: 'extensions',
    description: 'Manage extensions',
    kind: CommandKind.BUILT_IN,
    autoExecute: false,
    subCommands: [
      listExtensionsCommand,
      updateExtensionsCommand,
      exploreExtensionsCommand,
      restartCommand,
      ...conditionalCommands,
    ],
    action: (context, args) =>
      // Default to list if no subcommand is provided
      listExtensionsCommand.action!(context, args),
  };
}
