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
import i18n from '../../i18n/index.js';

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
      content: i18n.t('messages:restore.noDirectoryPath'),
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
          content: i18n.t('messages:restore.noRestorableToolCalls'),
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
        content: i18n.t('messages:restore.availableToolCalls', { fileList }),
      };
    }

    const selectedFile = args.endsWith('.json') ? args : `${args}.json`;

    if (!jsonFiles.includes(selectedFile)) {
      return {
        type: 'message',
        messageType: 'error',
        content: i18n.t('messages:restore.fileNotFound', { filename: selectedFile }),
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
          content: i18n.t('messages:restore.loadHistoryNotAvailable'),
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
          text: i18n.t('messages:operation.restored'),
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
      content: i18n.t('messages:restore.readError', { error }),
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
    description: i18n.t('commands:restore.description'),
    kind: CommandKind.BUILT_IN,
    action: restoreAction,
    completion,
  };
};
