/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { performRestore } from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import {
  listCheckpointFiles,
  readCheckpointData,
  getCheckpointInfoList,
  getFormattedCheckpointList,
} from '../utils/checkpoint_utils.js';
import { logger } from '../utils/logger.js';

export class RestoreCommand implements Command {
  readonly name = 'restore';
  readonly description =
    'Restore to a previous checkpoint, or list available checkpoints to restore. This will reset the conversation and file history to the state it was in when the checkpoint was created';
  readonly topLevel = true;
  readonly subCommands = [new ListCheckpointsCommand()];

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const { config, git: gitService } = context;
    const argsStr = args.join(' ');

    try {
      const jsonFiles = await listCheckpointFiles(config);

      if (!argsStr) {
        if (jsonFiles.length === 0) {
          return {
            name: this.name,
            data: (async function* () {
              yield {
                type: 'message',
                messageType: 'info',
                content: 'No restorable checkpoints found.',
              };
            })(),
          };
        }
        const fileList = await getFormattedCheckpointList(config);
        return {
          name: this.name,
          data: (async function* () {
            yield {
              type: 'message',
              messageType: 'info',
              content: `Available checkpoints to restore:\n\n${fileList}`,
            };
          })(),
        };
      }

      const selectedFile = argsStr.endsWith('.json')
        ? argsStr
        : `${argsStr}.json`;

      if (!jsonFiles.includes(selectedFile)) {
        return {
          name: this.name,
          data: (async function* () {
            yield {
              type: 'message',
              messageType: 'error',
              content: `File not found: ${selectedFile}`,
            };
          })(),
        };
      }

      const toolCallData = await readCheckpointData(config, selectedFile);
      const restoreResult = await performRestore(toolCallData, gitService);

      logger.info(`[Command] Restored to checkpoint ${argsStr}.`);

      return {
        name: this.name,
        data: restoreResult,
      };
    } catch (error) {
      return {
        name: this.name,
        data: (async function* () {
          yield {
            type: 'message',
            messageType: 'error',
            content: `Could not read restorable checkpoints. This is the error: ${error}`,
          };
        })(),
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
      const checkpointInfoList = await getCheckpointInfoList(config);

      return {
        name: this.name,
        data: (async function* () {
          yield {
            type: 'message',
            messageType: 'info',
            content: JSON.stringify(checkpointInfoList),
          };
        })(),
      };
    } catch (error) {
      return {
        name: this.name,
        data: (async function* () {
          yield {
            type: 'message',
            messageType: 'error',
            content: `Could not read checkpoints. This is the error: ${error}`,
          };
        })(),
      };
    }
  }
}
