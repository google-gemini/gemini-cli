/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createManualCheckpoint } from '@google/gemini-cli-core';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import type { HistoryItem } from '../types.js';

export const checkpointCommand: SlashCommand = {
  name: 'checkpoint',
  description:
    'Create a named checkpoint of the current file state and conversation history',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string) => {
    const { services, ui } = context;
    const { config, git: gitService } = services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found',
      };
    }

    if (!gitService) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Git service is not available. Please ensure you are in a git repository and checkpointing is enabled.',
      };
    }

    const checkpointName = args.trim() || `checkpoint-${Date.now()}`;
    const geminiClient = config.getGeminiClient();

    try {
      const history = ui.getHistory();
      const { fileName, content } = await createManualCheckpoint<HistoryItem[]>(
        checkpointName,
        gitService,
        geminiClient,
        history,
      );

      const checkpointDir = config.storage.getProjectTempCheckpointsDir();
      await fs.mkdir(checkpointDir, { recursive: true });
      await fs.writeFile(path.join(checkpointDir, fileName), content);

      return {
        type: 'message',
        messageType: 'info',
        content: `Checkpoint "${checkpointName}" created successfully.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
