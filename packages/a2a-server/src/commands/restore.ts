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
} from '../utils/checkpointUtils.js';

export class RestoreCommand implements Command {
  readonly name = 'restore';
  readonly description =
    'Restore a previous tool call, or list available tool calls to restore.';
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
                content: 'No restorable tool calls found.',
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
              content: `Available tool calls to restore:\n\n${fileList}`,
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

      return {
        name: this.name,
        data: performRestore(toolCallData, gitService),
      };
    } catch (error) {
      return {
        name: this.name,
        data: (async function* () {
          yield {
            type: 'message',
            messageType: 'error',
            content: `Could not read restorable tool calls. This is the error: ${error}`,
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
