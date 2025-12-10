/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitService } from '../services/gitService.js';
import type { CommandActionReturn } from './types.js';
import { type ToolCallData } from '../utils/checkpointUtils.js';

export async function* performRestore<
  HistoryType = unknown,
  ArgsType = unknown,
>(
  toolCallData: ToolCallData<HistoryType, ArgsType>,
  gitService: GitService | undefined,
): AsyncGenerator<CommandActionReturn<HistoryType>> {
  if (toolCallData.history && toolCallData.clientHistory) {
    yield {
      type: 'load_history',
      history: toolCallData.history,
      clientHistory: toolCallData.clientHistory,
    };
  }

  if (toolCallData.commitHash) {
    if (!gitService) {
      yield {
        type: 'message',
        messageType: 'error',
        content:
          'Git service is not available, cannot restore checkpoint. Please ensure you are in a git repository.',
      };
      return;
    }

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
}
