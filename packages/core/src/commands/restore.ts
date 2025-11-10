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
    try {
      await gitService.restoreProjectFromSnapshot(toolCallData.commitHash);
      yield {
        type: 'message',
        messageType: 'info',
        content: 'Restored project to the state before the tool call.',
      };
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('unable to read tree')) {
        yield {
          type: 'message',
          messageType: 'error',
          content: `The commit hash '${toolCallData.commitHash}' associated with this checkpoint could not be found in your Git repository. This can happen if the repository has been re-cloned, reset, or if old commits have been garbage collected. This checkpoint cannot be restored.`,
        };
        return;
      }
      throw e;
    }
  }

  if (toolCallData.toolCall) {
    const { name, args } = toolCallData.toolCall;
    if (name === 'replace') {
      const replaceArgs = args as {
        old_string: string;
        new_string: string;
        [key: string]: unknown;
      };
      yield {
        type: 'tool',
        toolName: name,
        toolArgs: {
          ...replaceArgs,
          old_string: replaceArgs.new_string,
          new_string: replaceArgs.old_string,
        },
      };
    } else {
      yield {
        type: 'tool',
        toolName: name,
        toolArgs: args as Record<string, unknown>,
      };
    }
  }
}
