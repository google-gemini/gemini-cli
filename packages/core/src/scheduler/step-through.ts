/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { on } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  MessageBusType,
  type StepThroughAction,
  type StepThroughResponse,
} from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ScheduledToolCall } from './types.js';

/**
 * Pauses execution before a tool fires in STEP mode.
 *
 * Publishes a STEP_THROUGH_REQUEST on the MessageBus, then waits for a
 * matching STEP_THROUGH_RESPONSE from the UI.  The caller is responsible for
 * interpreting the returned action:
 *   'next'     — proceed with execution
 *   'skip'     — return an empty result without executing
 *   'continue' — exit step-through and proceed
 *   'cancel'   — abort the entire agent turn
 */
export async function pauseForStepThrough(
  toolCall: ScheduledToolCall,
  signal: AbortSignal,
  messageBus: MessageBus,
  stepIndex: number,
  stepTotal: number,
): Promise<StepThroughAction> {
  if (signal.aborted) {
    return 'cancel';
  }

  const correlationId = randomUUID();

  // Announce the pending step to the UI.
  await messageBus.publish({
    type: MessageBusType.STEP_THROUGH_REQUEST,
    correlationId,
    callId: toolCall.request.callId,
    toolName: toolCall.request.name,
    toolArgs: toolCall.request.args,
    stepIndex,
    stepTotal,
  });

  // Await the matching response, honouring the abort signal.
  try {
    for await (const [msg] of on(
      messageBus,
      MessageBusType.STEP_THROUGH_RESPONSE,
      { signal },
    )) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const response = msg as StepThroughResponse;
      if (response.correlationId === correlationId) {
        return response.action;
      }
    }
  } catch {
    // AbortError or iterator close — treat as cancel.
    return 'cancel';
  }

  return 'cancel';
}
