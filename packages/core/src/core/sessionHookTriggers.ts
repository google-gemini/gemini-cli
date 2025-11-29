/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type HookExecutionRequest,
  type HookExecutionResponse,
} from '../confirmation-bus/types.js';
import type {
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
} from '../hooks/types.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Fires the SessionStart hook.
 *
 * @param messageBus The message bus to use for hook communication
 * @param source The source/trigger of the session start
 */
export async function fireSessionStartHook(
  messageBus: MessageBus,
  source: SessionStartSource,
): Promise<void> {
  try {
    await messageBus.request<HookExecutionRequest, HookExecutionResponse>(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'SessionStart',
        input: {
          source,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );
  } catch (error) {
    debugLogger.warn(`SessionStart hook failed:`, error);
  }
}

/**
 * Fires the SessionEnd hook.
 *
 * @param messageBus The message bus to use for hook communication
 * @param reason The reason for the session end
 */
export async function fireSessionEndHook(
  messageBus: MessageBus,
  reason: SessionEndReason,
): Promise<void> {
  try {
    await messageBus.request<HookExecutionRequest, HookExecutionResponse>(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'SessionEnd',
        input: {
          reason,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );
  } catch (error) {
    debugLogger.warn(`SessionEnd hook failed:`, error);
  }
}

/**
 * Fires the PreCompress hook.
 *
 * @param messageBus The message bus to use for hook communication
 * @param trigger The trigger type (manual or auto)
 */
export async function firePreCompressHook(
  messageBus: MessageBus,
  trigger: PreCompressTrigger,
): Promise<void> {
  try {
    await messageBus.request<HookExecutionRequest, HookExecutionResponse>(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'PreCompress',
        input: {
          trigger,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );
  } catch (error) {
    debugLogger.warn(`PreCompress hook failed:`, error);
  }
}
