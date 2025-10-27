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

  const actions = await restore(config, gitService, args);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const isLast = i === actions.length - 1;

    if (isLast) {
      return action;
    }

    if (action.type === 'message') {
      addItem(
        {
          type: action.messageType,
          text: action.content,
        },
        Date.now(),
      );
    } else if (action.type === 'load_history' && loadHistory) {
      loadHistory(action.history as HistoryItem[]);
    }
  }
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
