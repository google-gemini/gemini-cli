/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  type Config,
  performRestore,
  type ToolCallData,
} from '@google/gemini-cli-core';
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

  const checkpointDir = config?.storage.getProjectTempCheckpointsDir();

  if (!checkpointDir) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not determine the .gemini directory path.',
    };
  }

  try {
    // Ensure the directory exists before trying to read it.
    await fs.mkdir(checkpointDir, { recursive: true });
    const files = await fs.readdir(checkpointDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    if (!args) {
      if (jsonFiles.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No restorable tool calls found.',
        };
      }
      const truncatedFiles = jsonFiles.map((file) => {
        const components = file.split('.');
        if (components.length <= 1) {
          return file;
        }
        components.pop();
        return components.join('.');
      });
      const fileList = truncatedFiles.join('\n');
      return {
        type: 'message',
        messageType: 'info',
        content: `Available tool calls to restore:\n\n${fileList}`,
      };
    }

    const selectedFile = args.endsWith('.json') ? args : `${args}.json`;

    if (!jsonFiles.includes(selectedFile)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `File not found: ${selectedFile}`,
      };
    }

    const filePath = path.join(checkpointDir, selectedFile);
    const data = await fs.readFile(filePath, 'utf-8');
    const toolCallData = JSON.parse(data) as ToolCallData;

    const actionStream = performRestore(toolCallData, gitService);
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
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Could not read restorable tool calls. This is the error: ${error}`,
    };
  }
}

async function completion(
  context: CommandContext,
  _partialArg: string,
): Promise<string[]> {
  const { services } = context;
  const { config } = services;
  const checkpointDir = config?.storage.getProjectTempCheckpointsDir();
  if (!checkpointDir) {
    return [];
  }
  try {
    const files = await fs.readdir(checkpointDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));
  } catch (_err) {
    return [];
  }
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
