/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  type Config,
  formatCheckpointDisplayList,
  getToolCallDataSchema,
  getTruncatedCheckpointNames,
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

const HistoryItemSchema = z
  .object({
    type: z.string(),
    id: z.number(),
  })
  .passthrough();

const ToolCallDataSchema = getToolCallDataSchema(HistoryItemSchema);

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
      const fileList = formatCheckpointDisplayList(jsonFiles);
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
    const parseResult = ToolCallDataSchema.safeParse(JSON.parse(data));

    if (!parseResult.success) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Checkpoint file is invalid: ${parseResult.error.message}`,
      };
    }

    // We safely cast here because:
    // 1. ToolCallDataSchema strictly validates the existence of 'history' as an array and 'id'/'type' on each item.
    // 2. We trust that files valid according to this schema (written by useGeminiStream) contain the full HistoryItem structure.
    const toolCallData = parseResult.data as ToolCallData<
      HistoryItem[],
      Record<string, unknown>
    >;

    const actionStream = performRestore(toolCallData, gitService);

    for await (const action of actionStream) {
      if (action.type === 'message') {
        addItem(
          {
            type: action.messageType,
            text: action.content,
          },
          Date.now(),
        );
      } else if (action.type === 'load_history' && loadHistory) {
        loadHistory(action.history);
        if (action.clientHistory) {
          config?.getGeminiClient()?.setHistory(action.clientHistory);
        }
      }
    }

    return {
      type: 'tool',
      toolName: toolCallData.toolCall.name,
      toolArgs: toolCallData.toolCall.args,
    };
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
    const jsonFiles = files.filter((file) => file.endsWith('.json'));
    return getTruncatedCheckpointNames(jsonFiles);
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
    autoExecute: true,
    action: restoreAction,
    completion,
  };
};
