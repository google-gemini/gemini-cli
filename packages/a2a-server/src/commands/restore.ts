/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getCheckpointInfoList,
  getToolCallDataSchema,
  isNodeError,
  performRestore,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';

export class RestoreCommand implements Command {
  readonly name = 'restore';
  readonly description =
    'Restore to a previous checkpoint, or list available checkpoints to restore. This will reset the conversation and file history to the state it was in when the checkpoint was created';
  readonly topLevel = true;
  readonly requiresWorkspace = true;
  readonly subCommands = [new ListCheckpointsCommand()];

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const { config, git: gitService } = context;
    const argsStr = args.join(' ');

    try {
      if (!argsStr) {
        return {
          name: this.name,
          data: {
            type: 'message',
            messageType: 'error',
            content: 'Please provide a checkpoint name to restore.',
          },
        };
      }

      const selectedFile = argsStr.endsWith('.json')
        ? argsStr
        : `${argsStr}.json`;

      const checkpointDir = config.storage.getProjectTempCheckpointsDir();
      const filePath = path.join(checkpointDir, selectedFile);

      let data: string;
      try {
        data = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return {
            name: this.name,
            data: {
              type: 'message',
              messageType: 'error',
              content: `File not found: ${selectedFile}`,
            },
          };
        }
        throw error;
      }

      const toolCallData = JSON.parse(data);
      const ToolCallDataSchema = getToolCallDataSchema();
      const parseResult = ToolCallDataSchema.safeParse(toolCallData);

      if (!parseResult.success) {
        return {
          name: this.name,
          data: {
            type: 'message',
            messageType: 'error',
            content: 'Checkpoint file is invalid or corrupted.',
          },
        };
      }

      const restoreResultGenerator = performRestore(
        parseResult.data,
        gitService,
      );
      const restoreResult = [];
      for await (const result of restoreResultGenerator) {
        restoreResult.push(result);
      }

      return {
        name: this.name,
        data: restoreResult,
      };
    } catch (_error) {
      return {
        name: this.name,
        data: {
          type: 'message',
          messageType: 'error',
          content: 'An unexpected error occurred during restore.',
        },
      };
    }
  }
}

export class ListCheckpointsCommand implements Command {
  readonly name = 'restore list';
  readonly description = 'Lists all available checkpoints.';
  readonly topLevel = false;

  async execute(context: CommandContext): Promise<CommandExecutionResponse> {
    const { config } = context;

    try {
      const checkpointDir = config.storage.getProjectTempCheckpointsDir();
      await fs.mkdir(checkpointDir, { recursive: true });
      const files = await fs.readdir(checkpointDir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      const checkpointFiles = new Map<string, string>();
      for (const file of jsonFiles) {
        const filePath = path.join(checkpointDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        checkpointFiles.set(file, data);
      }

      const checkpointInfoList = getCheckpointInfoList(checkpointFiles);

      return {
        name: this.name,
        data: {
          type: 'message',
          messageType: 'info',
          content: JSON.stringify(checkpointInfoList),
        },
      };
    } catch (_error) {
      return {
        name: this.name,
        data: {
          type: 'message',
          messageType: 'error',
          content: 'An unexpected error occurred while listing checkpoints.',
        },
      };
    }
  }
}
