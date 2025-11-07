/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, listExtensions } from '@google/gemini-cli-core';
import type { ExtensionUpdateInfo } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import { MessageType, type HistoryItemExtensionsList } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import open from 'open';
import process from 'node:process';
import { Text } from 'ink';
import { ExtensionManager } from '../../config/extension-manager.js';
import { SettingScope } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';

async function listAction(context: CommandContext) {
  const historyItem: HistoryItemExtensionsList = {
    type: MessageType.EXTENSIONS_LIST,
    extensions: context.services.config
      ? listExtensions(context.services.config)
      : [],
  };

  context.ui.addItem(historyItem, Date.now());
}

function updateAction(context: CommandContext, args: string): Promise<void> {
  const updateArgs = args.split(' ').filter((value) => value.length > 0);
  const all = updateArgs.length === 1 && updateArgs[0] === '--all';
  const names = all ? null : updateArgs;

  if (!all && names?.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions update <extension-names>|--all',
      },
      Date.now(),
    );
    return Promise.resolve();
  }

  let resolveUpdateComplete: (updateInfo: ExtensionUpdateInfo[]) => void;
  const updateComplete = new Promise<ExtensionUpdateInfo[]>(
    (resolve) => (resolveUpdateComplete = resolve),
  );

  const historyItem: HistoryItemExtensionsList = {
    type: MessageType.EXTENSIONS_LIST,
    extensions: context.services.config
      ? listExtensions(context.services.config)
      : [],
  };

  updateComplete.then((updateInfos) => {
    if (updateInfos.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No extensions to update.',
        },
        Date.now(),
      );
    }

    context.ui.addItem(historyItem, Date.now());
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
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Extension ${name} not found.`,
            },
            Date.now(),
          );
          continue;
        }
      }
    }
  } catch (error) {
    resolveUpdateComplete!([]);
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  }
  return updateComplete.then((_) => {});
}

async function exploreAction(context: CommandContext) {
  const extensionsUrl = 'https://geminicli.com/extensions/';

  // Only check for NODE_ENV for explicit test mode, not for unit test framework
  if (process.env['NODE_ENV'] === 'test') {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Would open extensions page in your browser: ${extensionsUrl} (skipped in test environment)`,
      },
      Date.now(),
    );
  } else if (
    process.env['SANDBOX'] &&
    process.env['SANDBOX'] !== 'sandbox-exec'
  ) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `View available extensions at ${extensionsUrl}`,
      },
      Date.now(),
    );
  } else {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Opening extensions page in your browser: ${extensionsUrl}`,
      },
      Date.now(),
    );
    try {
      await open(extensionsUrl);
    } catch (_error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to open browser. Check out the extensions gallery at ${extensionsUrl}`,
        },
        Date.now(),
      );
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
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Usage: /extensions ${context.invocation?.name} <extension> [--scope=<user|workspace|session>]`,
      },
      Date.now(),
    );
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
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Unsupported scope ${parts[2]}, should be one of "user", "workspace", or "session"`,
        },
        Date.now(),
      );
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
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension "${name}" disabled for the scope "${scope}"`,
      },
      Date.now(),
    );
  }
}

async function enableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { names, scope, extensionManager } = enableContext;
  for (const name of names) {
    await extensionManager.enableExtension(name, scope);
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension "${name}" enabled for the scope "${scope}"`,
      },
      Date.now(),
    );
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
  if (context.invocation?.name === 'disable') {
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
  action: listAction,
};

const updateExtensionsCommand: SlashCommand = {
  name: 'update',
  description: 'Update extensions. Usage: update <extension-names>|--all',
  kind: CommandKind.BUILT_IN,
  action: updateAction,
  completion: completeExtensions,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable an extension',
  kind: CommandKind.BUILT_IN,
  action: disableAction,
  completion: completeExtensionsAndScopes,
};

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable an extension',
  kind: CommandKind.BUILT_IN,
  action: enableAction,
  completion: completeExtensionsAndScopes,
};

const exploreExtensionsCommand: SlashCommand = {
  name: 'explore',
  description: 'Open extensions page in your browser',
  kind: CommandKind.BUILT_IN,
  action: exploreAction,
};

async function uninstallAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const extensions = context.services.config
    ? listExtensions(context.services.config)
    : [];

  if (extensions.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'No extensions installed.',
      },
      Date.now(),
    );
    return;
  }

  // If an extension name is provided as argument, skip the selection and go to confirmation
  const trimmedArgs = args.trim();
  if (trimmedArgs) {
    const extension = extensions.find((ext) => ext.name === trimmedArgs);
    if (!extension) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Extension "${trimmedArgs}" not found.`,
        },
        Date.now(),
      );
      return;
    }

    // Show confirmation for the specified extension
    if (!context.overwriteConfirmed) {
      return {
        type: 'confirm_action',
        prompt: (
          <Text>
            Do you want to remove the extension{' '}
            <Text bold>{extension.name}</Text>?
          </Text>
        ),
        originalInvocation: {
          raw: `/extensions uninstall ${trimmedArgs}`,
        },
      } as const;
    }

    // Proceed with uninstallation
    try {
      const extensionManager = new ExtensionManager({
        workspaceDir: process.cwd(),
        requestConsent: requestConsentNonInteractive,
        requestSetting: promptForSetting,
        settings: context.services.settings.merged,
      });
      await extensionManager.loadExtensions();
      await extensionManager.uninstallExtension(extension.name, false);

      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Extension "${extension.name}" successfully uninstalled.`,
        },
        Date.now(),
      );

      // Manually update the list of extensions in the UI.
      const updatedExtensions = extensions.filter(
        (e) => e.name !== extension.name,
      );
      const historyItem: HistoryItemExtensionsList = {
        type: MessageType.EXTENSIONS_LIST,
        extensions: updatedExtensions,
      };
      context.ui.addItem(historyItem, Date.now());

      // Reload commands to reflect the changes
      context.ui.reloadCommands();
    } catch (error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to uninstall extension: ${getErrorMessage(error)}`,
        },
        Date.now(),
      );
    }
    return;
  }

  // Show selection list of extensions
  const extensionItems = extensions.map((ext) => ({
    label: ext.name,
    value: ext.name,
    key: ext.name,
  }));

  return {
    type: 'confirm_action',
    prompt: (
      <Text>
        Select an extension to uninstall (this will show a selection menu in the
        future):
        {extensionItems.map((item) => (
          <Text key={item.key}>
            {'\n'} - {item.label}
          </Text>
        ))}
      </Text>
    ),
    originalInvocation: {
      raw: '/extensions uninstall',
    },
  } as const;
}

const uninstallExtensionsCommand: SlashCommand = {
  name: 'uninstall',
  description: 'Uninstall an extension',
  kind: CommandKind.BUILT_IN,
  action: uninstallAction,
  completion: async (context, partialArg) => {
    const extensions = context.services.config
      ? listExtensions(context.services.config)
      : [];
    const extensionNames = extensions.map((ext) => ext.name);
    return extensionNames.filter((name) => name.startsWith(partialArg));
  },
};

export function extensionsCommand(
  enableExtensionReloading?: boolean,
): SlashCommand {
  const conditionalCommands = enableExtensionReloading
    ? [disableCommand, enableCommand]
    : [];
  return {
    name: 'extensions',
    description: 'Manage extensions',
    kind: CommandKind.BUILT_IN,
    subCommands: [
      listExtensionsCommand,
      updateExtensionsCommand,
      exploreExtensionsCommand,
      uninstallExtensionsCommand,
      ...conditionalCommands,
    ],
    action: (context, args) =>
      // Default to list if no subcommand is provided
      listExtensionsCommand.action!(context, args),
  };
}
