/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  messageId?: string;
}

export async function* performRestore(
  toolCallData: ToolCallData,
  gitService: GitService | undefined,
): AsyncGenerator<CommandActionReturn> {
  if (toolCallData.history && toolCallData.clientHistory) {
    yield {
      type: 'load_history',
      history: toolCallData.history,
      clientHistory: toolCallData.clientHistory,
    };
  }

  if (toolCallData.commitHash && gitService) {
    await gitService.restoreProjectFromSnapshot(toolCallData.commitHash);
    yield {
      type: 'message',
      messageType: 'info',
      content: 'Restored project to the state before the tool call.',
    };
  }

  if (toolCallData.toolCall) {
    yield {
      type: 'tool',
      toolName: toolCallData.toolCall.name,
      toolArgs: toolCallData.toolCall.args as Record<string, unknown>,
    };
  }
}
