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
  CommandKind,
} from './types.js';
import open from 'open';
import process from 'node:process';
import { ExtensionManager } from '../../config/extension-manager.js';
import { SettingScope } from '../../config/settings.js';

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
  args: string,
): {
  extensionManager: ExtensionManager;
  name: string;
  scope: SettingScope;
} | null {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error('Cannot disable extensions in this environment');
    return null;
  }
  const parts = args.split(' ');
  if (parts.length !== 1 && (parts.length !== 3 || parts[2] !== '--scope')) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions disable <extension-names>|--all [--scope=<user|workspace|session>]',
      },
      Date.now(),
    );
    return null;
  }
  const name = parts[0];
  let scope: SettingScope = SettingScope.Session;
  if (parts.length === 3) {
    switch (parts[2]) {
      case 'workspace':
        scope = SettingScope.Workspace;
        break;
      case 'user':
        scope = SettingScope.User;
        break;
      case 'session':
      case '':
      case null:
      case undefined:
        break;
      default:
        debugLogger.error(`Unsupported scope ${parts[2]}`);
        return null;
    }
  }
  return {
    extensionManager: extensionLoader,
    name,
    scope,
  };
}

async function disableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { name, scope, extensionManager } = enableContext;
  await extensionManager.disableExtension(name!, scope);
  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `Extension "${name}" disabled for the scope "${scope}"`,
    },
    Date.now(),
  );
}

async function enableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { name, scope, extensionManager } = enableContext;
  await extensionManager.enableExtension(name!, scope);
  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `Extension "${name}" enabled for the scope "${scope}"`,
    },
    Date.now(),
  );
}

async function completeExtensions(context: CommandContext, partialArg: string) {
  const extensions = context.services.config?.getExtensions() ?? [];
  const extensionNames = extensions.map((ext) => ext.name);
  const suggestions = extensionNames.filter((name) =>
    name.startsWith(partialArg),
  );

  if ('--all'.startsWith(partialArg) || 'all'.startsWith(partialArg)) {
    suggestions.unshift('--all');
  }

  return suggestions;
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
  completion: completeExtensions,
};

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable an extension',
  kind: CommandKind.BUILT_IN,
  action: enableAction,
  completion: completeExtensions,
};

const exploreExtensionsCommand: SlashCommand = {
  name: 'explore',
  description: 'Open extensions page in your browser',
  kind: CommandKind.BUILT_IN,
  action: exploreAction,
};

export const extensionsCommand: SlashCommand = {
  name: 'extensions',
  description: 'Manage extensions',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    listExtensionsCommand,
    updateExtensionsCommand,
    exploreExtensionsCommand,
    disableCommand,
    enableCommand,
  ],
  action: (context, args) =>
    // Default to list if no subcommand is provided
    listExtensionsCommand.action!(context, args),
};
