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
        return await new ListCheckpointsCommand().execute(context);
      }

      if (!config.getCheckpointingEnabled()) {
        return {
          name: this.name,
          data: 'Checkpointing is not enabled. Please enable it in your settings (`general.checkpointing.enabled: true`) to use /restore.',
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
            data: `File not found: ${selectedFile}`,
          };
        }
        throw error;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const toolCallData = JSON.parse(data);
      const ToolCallDataSchema = getToolCallDataSchema();
      const parseResult = ToolCallDataSchema.safeParse(toolCallData);

      if (!parseResult.success) {
        return {
          name: this.name,
          data: 'Checkpoint file is invalid or corrupted.',
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

      // Format the result nicely since Zed just dumps data
      const formattedResult = restoreResult
        .map((r) => {
          if (r.type === 'message') {
            return `[${r.messageType.toUpperCase()}] ${r.content}`;
          } else if (r.type === 'load_history') {
            return `Loaded history with ${r.clientHistory.length} messages.`;
          }
          return `Restored: ${JSON.stringify(r)}`;
        })
        .join('\n');

      return {
        name: this.name,
        data: formattedResult,
      };
    } catch (error) {
      return {
        name: this.name,
        data: `An unexpected error occurred during restore: ${error}`,
      };
    }
  }
}

export class ListCheckpointsCommand implements Command {
  readonly name = 'restore list';
  readonly description = 'Lists all available checkpoints.';

  async execute(context: CommandContext): Promise<CommandExecutionResponse> {
    const { config } = context;

    try {
      if (!config.getCheckpointingEnabled()) {
        return {
          name: this.name,
          data: 'Checkpointing is not enabled. Please enable it in your settings (`general.checkpointing.enabled: true`) to use /restore.',
        };
      }

      const checkpointDir = config.storage.getProjectTempCheckpointsDir();
      try {
        await fs.mkdir(checkpointDir, { recursive: true });
      } catch (_e) {
        // Ignore
      }

      const files = await fs.readdir(checkpointDir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return { name: this.name, data: 'No checkpoints found.' };
      }

      const checkpointFiles = new Map<string, string>();
      for (const file of jsonFiles) {
        const filePath = path.join(checkpointDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        checkpointFiles.set(file, data);
      }

      const checkpointInfoList = getCheckpointInfoList(checkpointFiles);

      const formatted = checkpointInfoList
        .map((info) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const i = info as Record<string, any>;
          const fileName = String(i['fileName'] || 'Unknown');
          const toolName = String(i['toolName'] || 'Unknown');
          const status = String(i['status'] || 'Unknown');
          const timestamp = new Date(
            Number(i['timestamp']) || 0,
          ).toLocaleString();

          return `- **${fileName}**: ${toolName} (Status: ${status}) [${timestamp}]`;
        })
        .join('\n');

      return {
        name: this.name,
        data: `Available Checkpoints:\n${formatted}`,
      };
    } catch (_error) {
      return {
        name: this.name,
        data: 'An unexpected error occurred while listing checkpoints.',
      };
    }
  }
}
