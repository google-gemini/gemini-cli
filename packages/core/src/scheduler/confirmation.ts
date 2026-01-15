/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MessageBusType,
  type ToolConfirmationResponse,
} from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  ToolConfirmationOutcome,
  type ToolConfirmationPayload,
} from '../tools/tools.js';

export interface ConfirmationResult {
  outcome: ToolConfirmationOutcome;
  payload?: ToolConfirmationPayload;
}

/**
 * Waits for a confirmation response with the matching correlationId.
 */
export async function awaitConfirmation(
  messageBus: MessageBus,
  correlationId: string,
  signal: AbortSignal,
): Promise<ConfirmationResult> {
  if (signal.aborted) {
    throw new Error('Operation cancelled');
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      messageBus.unsubscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        onResponse,
      );
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Operation cancelled'));
    };

    const onResponse = (msg: ToolConfirmationResponse) => {
      if (msg.correlationId === correlationId) {
        cleanup();
        resolve({
          outcome:
            msg.outcome ??
            // TODO: Remove legacy confirmed boolean fallback once migration complete
            (msg.confirmed
              ? ToolConfirmationOutcome.ProceedOnce
              : ToolConfirmationOutcome.Cancel),
          payload: msg.payload,
        });
      }
    };

    try {
      messageBus.subscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        onResponse,
      );
      signal.addEventListener('abort', onAbort);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
