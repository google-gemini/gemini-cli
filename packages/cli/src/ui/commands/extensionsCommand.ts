/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  updateExtensionByName,
  updateAllUpdatableExtensions,
  type ExtensionUpdateInfo,
} from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

async function listAction(context: CommandContext) {
  const activeExtensions = context.services.config
    ?.getExtensions()
    .filter((ext) => ext.isActive);
  if (!activeExtensions || activeExtensions.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'No active extensions.',
      },
      Date.now(),
    );
    return;
  }

  const extensionLines = activeExtensions.map(
    (ext) => `  - \u001b[36m${ext.name} (v${ext.version})\u001b[0m`,
  );
  const message = `Active extensions:\n\n${extensionLines.join('\n')}\n`;

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: message,
    },
    Date.now(),
  );
}

const updateOutput = (info: ExtensionUpdateInfo) =>
  `Extension "${info.name}" successfully updated: ${info.originalVersion} → ${info.updatedVersion}. Restart gemini-cli to see the changes.`;

async function updateAction(context: CommandContext, args: string) {
  const updateArgs = args.split(' ').filter((value) => value.length > 0);
  const all = updateArgs.length === 1 && updateArgs[0] === '--all';
  const names = all ? undefined : updateArgs;

  if (all) {
    try {
      const updateInfos = await updateAllUpdatableExtensions();
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
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: updateInfos.map((info) => updateOutput(info)).join('\n'),
        },
        Date.now(),
      );
    } catch (error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: getErrorMessage(error),
        },
        Date.now(),
      );
    }
  } else if (names?.length) {
    for (const name of names) {
      try {
        const updatedExtensionInfo = await updateExtensionByName(name);
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: updateOutput(updatedExtensionInfo),
          },
          Date.now(),
        );
      } catch (error) {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: getErrorMessage(error),
          },
          Date.now(),
        );
      }
    }
  } else {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions update <extension-names>|--all',
      },
      Date.now(),
    );
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
