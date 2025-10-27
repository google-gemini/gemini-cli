/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config/config.js';
import type { GitService } from '../services/gitService.js';
import type { CommandActionReturn } from './types.js';
import type { Content } from '@google/genai';

export interface ToolCallData {
  history?: unknown;
  clientHistory?: Content[];
  commitHash?: string;
  toolCall: {
    name: string;
    args: unknown;
  };
}

export async function restore(
  config: Config,
  gitService: GitService | undefined,
  args: string,
): Promise<CommandActionReturn[]> {
  const checkpointDir = config.storage.getProjectTempCheckpointsDir();

  if (!checkpointDir) {
    return [
      {
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the .gemini directory path.',
      },
    ];
  }

  try {
    // Ensure the directory exists before trying to read it.
    await fs.mkdir(checkpointDir, { recursive: true });
    const files = await fs.readdir(checkpointDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    if (!args) {
      if (jsonFiles.length === 0) {
        return [
          {
            type: 'message',
            messageType: 'info',
            content: 'No restorable tool calls found.',
          },
        ];
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
      return [
        {
          type: 'message',
          messageType: 'info',
          content: `Available tool calls to restore:\n\n${fileList}`,
        },
      ];
    }

    const selectedFile = args.endsWith('.json') ? args : `${args}.json`;

    if (!jsonFiles.includes(selectedFile)) {
      return [
        {
          type: 'message',
          messageType: 'error',
          content: `File not found: ${selectedFile}`,
        },
      ];
    }

    const filePath = path.join(checkpointDir, selectedFile);
    const data = await fs.readFile(filePath, 'utf-8');
    const toolCallData = JSON.parse(data) as ToolCallData;

    const actions: CommandActionReturn[] = [];

    if (toolCallData.history && toolCallData.clientHistory) {
      actions.push({
        type: 'load_history',
        history: toolCallData.history,
        clientHistory: toolCallData.clientHistory,
      });
    }

    if (toolCallData.commitHash && gitService) {
      await gitService.restoreProjectFromSnapshot(toolCallData.commitHash);
      actions.push({
        type: 'message',
        messageType: 'info',
        content: 'Restored project to the state before the tool call.',
      });
    }

    if (toolCallData.toolCall) {
      actions.push({
        type: 'tool',
        toolName: toolCallData.toolCall.name,
        toolArgs: toolCallData.toolCall.args as Record<string, unknown>,
      });
    }

    return actions;
  } catch (error) {
    return [
      {
        type: 'message',
        messageType: 'error',
        content: `Could not read restorable tool calls. This is the error: ${error}`,
      },
    ];
  }
}

export async function restoreCompletion(config: Config): Promise<string[]> {
  const checkpointDir = config.storage.getProjectTempCheckpointsDir();
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
