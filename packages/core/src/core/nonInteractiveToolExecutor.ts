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
 * Executes a single tool call by leveraging the CoreToolScheduler.
 *
 * This executor is designed for "headless" or non-interactive tool execution,
 * such as within subagents. Tool confirmations are not shown inline; instead,
 * confirmation requests are published to the MessageBus and handled by the
 * parent UI's useToolConfirmationListener hook.
 *
 * @param config The runtime configuration.
 * @param toolCallRequest The tool call to execute.
 * @param abortSignal Signal to abort the tool execution.
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
      // Don't respond to confirmation requests - let the parent UI's
      // useToolConfirmationListener hook handle them via MessageBus.
      ignoreToolConfirmationRequests: true,
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
