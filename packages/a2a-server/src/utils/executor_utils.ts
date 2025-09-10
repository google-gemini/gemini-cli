/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { v4 as uuidv4 } from 'uuid';

import { CoderAgentEvent } from '../types.js';
import type { StateChange } from '../types.js';

export async function pushTaskStateFailed(
  error: unknown,
  eventBus: ExecutionEventBus,
  taskId: string,
  contextId: string,
) {
  const errorMessage =
    error instanceof Error ? error.message : 'Agent execution error';
  const stateChange: StateChange = {
    kind: CoderAgentEvent.StateChangeEvent,
  };
  eventBus.publish({
    kind: 'status-update',
    taskId,
    contextId,
    status: {
      state: 'failed',
      message: {
        kind: 'message',
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: errorMessage,
          },
        ],
        messageId: uuidv4(),
        taskId,
        contextId,
      } as Message,
    },
    final: true,
    metadata: {
      coderAgent: stateChange,
      model: 'unknown',
      error: errorMessage,
    },
  });
}
