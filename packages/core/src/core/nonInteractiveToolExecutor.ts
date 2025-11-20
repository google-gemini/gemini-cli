/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolCallRequestInfo, Config } from '../index.js';
import {
  CoreToolScheduler,
  type CompletedToolCall,
} from './coreToolScheduler.js';

/**
 * Executes a single tool call non-interactively by leveraging the CoreToolScheduler.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  abortSignal: AbortSignal,
): Promise<CompletedToolCall> {
  return new Promise<CompletedToolCall>((resolve, reject) => {
    const scheduler = new CoreToolScheduler({
      config,
      getPreferredEditor: () => undefined,
      onAllToolCallsComplete: async (completedToolCalls) => {
        if (completedToolCalls.length > 0) {
          resolve(completedToolCalls[0]);
        } else {
          reject(new Error('No completed tool calls returned.'));
        }
      },
    });

    scheduler.schedule(toolCallRequest, abortSignal).catch((error) => {
      reject(error);
    });
  });
}
