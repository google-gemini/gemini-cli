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
import { DelegatedConfirmationStrategy } from './confirmation/DelegatedConfirmationStrategy.js';

/**
 * Executes a single tool call non-interactively by leveraging the CoreToolScheduler.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  abortSignal: AbortSignal,
): Promise<CompletedToolCall> {
  const messageBus = config.getMessageBus();
  const confirmationStrategy = messageBus
    ? new DelegatedConfirmationStrategy(messageBus)
    : undefined;

  return new Promise<CompletedToolCall>((resolve, reject) => {
    const scheduler = new CoreToolScheduler({
      config,
      getPreferredEditor: () => undefined,
      confirmationStrategy,
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
