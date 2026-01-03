/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentExecutionEvent } from '@a2a-js/sdk/server';
import { DefaultExecutionEventBus } from '@a2a-js/sdk/server';
import { logger } from './logger.js';

/**
 * Creates a minimal event bus for background task execution that avoids coupling
 * to HTTP response lifecycle. Only logs terminal state transitions to
 * prevent excessive logging for long-running tasks.
 *
 * @param taskId - The task ID for logging purposes
 * @returns A DefaultExecutionEventBus with minimal logging attached
 */
export function createBackgroundEventBus(
  taskId: string,
): DefaultExecutionEventBus {
  const eventBus = new DefaultExecutionEventBus();

  // Only log terminal state transitions to avoid excessive logging
  eventBus.on('event', (event: AgentExecutionEvent) => {
    if (event.kind === 'status-update' && event.final) {
      const state = event.status?.state;
      logger.info(
        `[BackgroundEventBus] Task ${taskId} reached terminal state: ${state}`,
      );
    }
  });

  return eventBus;
}
