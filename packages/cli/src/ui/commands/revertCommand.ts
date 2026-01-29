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

async function revertAction(
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

    if (!args) {
      if (jsonFiles.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content:
            'No checkpoints found. Use /checkpoint <name> to create one.',
        };
      }

      // Read all files to find named ones
      const namedCheckpoints: string[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(
            path.join(checkpointDir, file),
            'utf-8',
          );
          const data = JSON.parse(content) as ToolCallData;
          const displayName = data.name ? `${data.name} (${file})` : file;
          namedCheckpoints.push(displayName);
        } catch (_e) {
          namedCheckpoints.push(file);
        }
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `Available checkpoints:\n\n${namedCheckpoints.join('\n')}\n\nUse /revert <name_or_filename> to restore.`,
      };
    }

    const searchTerm = args.trim();
    let selectedFile: string | undefined;

    // Try to find by name first, then by exact filename
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(
          path.join(checkpointDir, file),
          'utf-8',
        );
        const data = JSON.parse(content) as ToolCallData;
        if (
          data.name === searchTerm ||
          file === searchTerm ||
          file === `${searchTerm}.json`
        ) {
          selectedFile = file;
          break;
        }
      } catch (_e) {
        if (file === searchTerm || file === `${searchTerm}.json`) {
          selectedFile = file;
          break;
        }
      }
    }

    if (!selectedFile) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Checkpoint "${searchTerm}" not found.`,
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

    if (toolCallData.toolCall) {
      return {
        type: 'tool',
        toolName: toolCallData.toolCall.name,
        toolArgs: toolCallData.toolCall.args,
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Successfully reverted to checkpoint "${toolCallData.name || selectedFile}".`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Error during revert: ${error instanceof Error ? error.message : String(error)}`,
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

    const names: string[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(
          path.join(checkpointDir, file),
          'utf-8',
        );
        const data = JSON.parse(content) as ToolCallData;
        if (data.name) names.push(data.name);
      } catch (_e) {
        // Ignore errors reading individual checkpoint files during completion
      }
    }

    return [...names, ...getTruncatedCheckpointNames(jsonFiles)];
  } catch (_err) {
    return [];
  }
}

export const revertCommand: SlashCommand = {
  name: 'revert',
  description: 'Revert the project and conversation to a previous checkpoint',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: revertAction,
  completion,
};
