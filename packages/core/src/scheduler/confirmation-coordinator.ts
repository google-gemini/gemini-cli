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

export class ConfirmationCoordinator {
  constructor(private readonly messageBus: MessageBus) {}

  /**
   * Waits for a confirmation response with the matching correlationId.
   */
  async awaitConfirmation(
    correlationId: string,
    signal: AbortSignal,
  ): Promise<{
    outcome: ToolConfirmationOutcome;
    payload?: ToolConfirmationPayload;
  }> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.messageBus.unsubscribe(
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
        this.messageBus.subscribe(
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
}
