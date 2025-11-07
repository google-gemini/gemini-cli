/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { restore, restoreCompletion } from '@google/gemini-cli-core';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import type { HistoryItem } from '../types.js';

async function restoreAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const { services, ui } = context;
  const { config, git: gitService } = services;
  const { addItem, loadHistory } = ui;

  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not determine the .gemini directory path.',
    };
  }

  const actionStream = restore(config, gitService, args);
  let previousAction: SlashCommandActionReturn | undefined;

  for await (const currentAction of actionStream) {
    if (previousAction) {
      // This was not the last action, so process it now.
      if (previousAction.type === 'message') {
        addItem(
          {
            type: previousAction.messageType,
            text: previousAction.content,
          },
          Date.now(),
        );
      } else if (previousAction.type === 'load_history' && loadHistory) {
        loadHistory(previousAction.history as HistoryItem[]);
      }
    }
    previousAction = currentAction;
  }

  // After the loop, previousAction holds the last action, which we return.
  return previousAction;
}

async function completion(
  context: CommandContext,
  _partialArg: string,
): Promise<string[]> {
  const { services } = context;
  const { config } = services;
  if (!config) {
    return [];
  }

  return restoreCompletion(config);
}

export const restoreCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getCheckpointingEnabled()) {
    return null;
  }

  return {
    name: 'restore',
    description:
      'Restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested',
    kind: CommandKind.BUILT_IN,
    action: restoreAction,
    completion,
  };
};
