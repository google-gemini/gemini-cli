/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { requestConsentInteractive } from '../../config/extension.js';
import {
  updateAllUpdatableExtensions,
  type ExtensionUpdateInfo,
  updateExtension,
  checkForAllExtensionUpdates,
} from '../../config/extensions/update.js';
import { getErrorMessage } from '../../utils/errors.js';
import { ExtensionUpdateState } from '../state/extensions.js';
import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

async function listAction(context: CommandContext) {
  context.ui.addItem(
    {
      type: MessageType.EXTENSIONS_LIST,
    },
    Date.now(),
  );
}

async function updateAction(context: CommandContext, args: string) {
  const updateArgs = args.split(' ').filter((value) => value.length > 0);
  const all = updateArgs.length === 1 && updateArgs[0] === '--all';
  const names = all ? undefined : updateArgs;
  let updateInfos: ExtensionUpdateInfo[] = [];

  if (!all && names?.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions update <extension-names>|--all',
      },
      Date.now(),
    );
    return;
  }

  try {
    await checkForAllExtensionUpdates(
      context.services.config!.getExtensions(),
      context.ui.dispatchExtensionStateUpdate,
    );
    context.ui.setPendingItem({
      type: MessageType.EXTENSIONS_LIST,
    });
    if (all) {
      updateInfos = await updateAllUpdatableExtensions(
        context.services.config!.getWorkingDir(),
        // We don't have the ability to prompt for consent yet in this flow.
        (description) =>
          requestConsentInteractive(
            description,
            context.ui.addConfirmUpdateExtensionRequest,
          ),
        context.services.config!.getExtensions(),
        context.ui.extensionsUpdateState,
        context.ui.dispatchExtensionStateUpdate,
      );
    } else if (names?.length) {
      const workingDir = context.services.config!.getWorkingDir();
      const extensions = context.services.config!.getExtensions();
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
        const updateInfo = await updateExtension(
          extension,
          workingDir,
          (description) =>
            requestConsentInteractive(
              description,
              context.ui.addConfirmUpdateExtensionRequest,
            ),
          context.ui.extensionsUpdateState.get(extension.name)?.status ??
            ExtensionUpdateState.UNKNOWN,
          context.ui.dispatchExtensionStateUpdate,
        );
        if (updateInfo) updateInfos.push(updateInfo);
      }
    }

    if (updateInfos.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No extensions to update.',
        },
        Date.now(),
      );
      return;
    }
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  } finally {
    context.ui.addItem(
      {
        type: MessageType.EXTENSIONS_LIST,
      },
      Date.now(),
    );
    context.ui.setPendingItem(null);
  }
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
  completion: async (context, partialArg) => {
    const extensions = context.services.config?.getExtensions() ?? [];
    const extensionNames = extensions.map((ext) => ext.name);
    const suggestions = extensionNames.filter((name) =>
      name.startsWith(partialArg),
    );

    if ('--all'.startsWith(partialArg) || 'all'.startsWith(partialArg)) {
      suggestions.unshift('--all');
    }

    return suggestions;
  },
};

export const extensionsCommand: SlashCommand = {
  name: 'extensions',
  description: 'Manage extensions',
  kind: CommandKind.BUILT_IN,
  subCommands: [listExtensionsCommand, updateExtensionsCommand],
  action: (context, args) =>
    // Default to list if no subcommand is provided
    listExtensionsCommand.action!(context, args),
};
