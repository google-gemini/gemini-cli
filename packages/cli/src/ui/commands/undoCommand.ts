/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  getToolCallDataSchema,
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

async function undoAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  const { services, ui } = context;
  const { config, git: gitService } = services;
  const { addItem, loadHistory } = ui;

  const checkpointDir = config?.storage.getProjectTempCheckpointsDir();

  if (!checkpointDir) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not determine the checkpoints directory path.',
    };
  }

  try {
    await fs.mkdir(checkpointDir, { recursive: true });
    const files = await fs.readdir(checkpointDir);
    const jsonFiles = files
      .filter((file) => file.endsWith('.json'))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to undo. No checkpoints found.',
      };
    }

    // Latest checkpoint is the first one in sorted-reverse list
    const selectedFile = jsonFiles[0];
    const filePath = path.join(checkpointDir, selectedFile);
    const data = await fs.readFile(filePath, 'utf-8');
    const parseResult = ToolCallDataSchema.safeParse(JSON.parse(data));

    if (!parseResult.success) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Latest checkpoint file is invalid.`,
      };
    }

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

    // CRITICAL: Refresh the context manager so the AI doesn't see stale file content
    await config?.getContextManager()?.refresh();

    // Delete the checkpoint after undoing to allow undoing the previous one
    await fs.unlink(filePath);

    return {
      type: 'message',
      messageType: 'info',
      content: `Successfully undid the last action.`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Error during undo: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const undoCommand: SlashCommand = {
  name: 'undo',
  description: 'Undo the last action (reverts files and conversation)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: undoAction,
};
