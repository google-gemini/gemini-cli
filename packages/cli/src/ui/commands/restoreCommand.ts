/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import { Config } from '@google/gemini-cli-core';

async function restoreAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const { services, ui } = context;
  const { config, git: gitService } = services;
  const { addItem, loadHistory } = ui;

  const checkpointDir = config?.getProjectTempDir()
    ? path.join(config.getProjectTempDir(), 'checkpoints')
    : undefined;

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
    const toolCallData = JSON.parse(data);

    if (toolCallData.history) {
      if (!loadHistory) {
        // This should not happen
        return {
          type: 'message',
          messageType: 'error',
          content: 'loadHistory function is not available.',
        };
      }
      loadHistory(toolCallData.history);
    }

    if (toolCallData.clientHistory) {
      await config?.getGeminiClient()?.setHistory(toolCallData.clientHistory);
    }

    if (toolCallData.commitHash) {
      await gitService?.restoreProjectFromSnapshot(toolCallData.commitHash);
      addItem(
        {
          type: 'info',
          text: 'Restored project to the state before the tool call.',
        },
        Date.now(),
      );
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
  const checkpointDir = config?.getProjectTempDir()
    ? path.join(config.getProjectTempDir(), 'checkpoints')
    : undefined;
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
