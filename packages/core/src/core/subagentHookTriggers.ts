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
import { createHookOutput, type DefaultHookOutput } from '../hooks/types.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Fires the BeforeSubAgent hook and returns the hook output.
 * This should be called before executing a subagent.
 *
 * The caller can use the returned DefaultHookOutput methods:
 * - isBlockingDecision() / shouldStopExecution() to check if blocked
 * - getEffectiveReason() to get the blocking reason
 * - getAdditionalContext() to get additional context to add
 * - getModifiedSubagentInput() to get modified inputs (cast to BeforeSubAgentHookOutput)
 *
 * @param messageBus The message bus to use for hook communication
 * @param subagentName The name of the subagent being invoked
 * @param displayName The display name of the subagent (optional)
 * @param inputs The input parameters for the subagent
 * @returns The hook output, or undefined if no hook was executed or on error
 */
export async function fireBeforeSubAgentHook(
  messageBus: MessageBus,
  subagentName: string,
  displayName: string | undefined,
  inputs: Record<string, unknown>,
): Promise<DefaultHookOutput | undefined> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'BeforeSubAgent',
        input: {
          subagent_name: subagentName,
          subagent_display_name: displayName,
          subagent_inputs: inputs,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    return response.output
      ? createHookOutput('BeforeSubAgent', response.output)
      : undefined;
  } catch (error) {
    debugLogger.debug(`BeforeSubAgent hook failed: ${error}`);
    return undefined;
  }
}

/**
 * Fires the AfterSubAgent hook and returns the hook output.
 * This should be called after a subagent has completed execution.
 *
 * The caller can use the returned DefaultHookOutput methods:
 * - getAdditionalContext() to get additional context to add to the result
 *
 * @param messageBus The message bus to use for hook communication
 * @param subagentName The name of the subagent that was invoked
 * @param displayName The display name of the subagent (optional)
 * @param inputs The input parameters that were used
 * @param output The output from the subagent execution
 * @returns The hook output, or undefined if no hook was executed or on error
 */
export async function fireAfterSubAgentHook(
  messageBus: MessageBus,
  subagentName: string,
  displayName: string | undefined,
  inputs: Record<string, unknown>,
  output: { result: string; terminate_reason: string },
): Promise<DefaultHookOutput | undefined> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'AfterSubAgent',
        input: {
          subagent_name: subagentName,
          subagent_display_name: displayName,
          subagent_inputs: inputs,
          subagent_output: output,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    return response.output
      ? createHookOutput('AfterSubAgent', response.output)
      : undefined;
  } catch (error) {
    debugLogger.debug(`AfterSubAgent hook failed: ${error}`);
    return undefined;
  }
}
