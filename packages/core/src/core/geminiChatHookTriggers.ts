/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  GenerateContentParameters,
  GenerateContentConfig,
  ContentListUnion,
  ToolConfig,
  ToolListUnion,
} from '@google/genai';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type HookExecutionRequest,
  type HookExecutionResponse,
} from '../confirmation-bus/types.js';
import {
  createHookOutput,
  type BeforeModelHookOutput,
  type BeforeToolSelectionHookOutput,
  type AfterModelHookOutput,
} from '../hooks/types.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Result from firing the BeforeModel hook.
 */
export interface BeforeModelHookResult {
  /** Whether the model call was blocked */
  blocked: boolean;
  /** Whether the execution should be stopped entirely */
  stopped?: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Synthetic response to return instead of calling the model (if blocked) */
  syntheticResponse?: GenerateContentResponse;
  /** Modified config (if not blocked) */
  modifiedConfig?: GenerateContentConfig;
  /** Modified contents (if not blocked) */
  modifiedContents?: ContentListUnion;
}

/**
 * Result from firing the BeforeToolSelection hook.
 */
export interface BeforeToolSelectionHookResult {
  /** Modified tool config */
  toolConfig?: ToolConfig;
  /** Modified tools */
  tools?: ToolListUnion;
}

/**
 * Result from firing the AfterModel hook.
 * Contains either a modified response or indicates to use the original chunk.
 */
export interface AfterModelHookResult {
  /** The response to yield (either modified or original) */
  response: GenerateContentResponse;
  /** Whether the execution should be stopped entirely */
  stopped?: boolean;
  /** Whether the model call was blocked */
  blocked?: boolean;
  /** Reason for blocking or stopping */
  reason?: string;
}

/**
 * Fires the BeforeModel hook and returns the result.
 */
export async function fireBeforeModelHook(
  messageBus: MessageBus,
  llmRequest: GenerateContentParameters,
): Promise<BeforeModelHookResult> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'BeforeModel',
        input: {
          llm_request: llmRequest as unknown as Record<string, unknown>,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    // Reconstruct result from response
    const beforeResultFinalOutput = response.output
      ? createHookOutput('BeforeModel', response.output)
      : undefined;

    const hookOutput = beforeResultFinalOutput;

    // Check if hook requested to stop execution
    if (hookOutput?.shouldStopExecution()) {
      return {
        blocked: true,
        stopped: true,
        reason: hookOutput.getEffectiveReason(),
      };
    }

    // Check if hook blocked the model call
    const blockingError = hookOutput?.getBlockingError();
    if (blockingError?.blocked) {
      const beforeModelOutput = hookOutput as BeforeModelHookOutput;
      const syntheticResponse = beforeModelOutput.getSyntheticResponse();
      const reason =
        hookOutput?.getEffectiveReason() || 'Model call blocked by hook';

      return {
        blocked: true,
        reason,
        syntheticResponse,
      };
    }

    // Apply modifications from hook
    if (hookOutput) {
      const beforeModelOutput = hookOutput as BeforeModelHookOutput;
      const modifiedRequest =
        beforeModelOutput.applyLLMRequestModifications(llmRequest);

      return {
        blocked: false,
        modifiedConfig: modifiedRequest.config,
        modifiedContents: modifiedRequest.contents,
      };
    }

    return { blocked: false };
  } catch (error) {
    debugLogger.debug(`BeforeModel hook failed:`, error);
    return { blocked: false };
  }
}

/**
 * Fires the BeforeToolSelection hook and returns the result.
 *
 * @param messageBus The message bus to use for hook communication
 * @param llmRequest The LLM request parameters
 * @returns The hook result with tool configuration modifications
 */
export async function fireBeforeToolSelectionHook(
  messageBus: MessageBus,
  llmRequest: GenerateContentParameters,
): Promise<BeforeToolSelectionHookResult> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'BeforeToolSelection',
        input: {
          llm_request: llmRequest as unknown as Record<string, unknown>,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    // Reconstruct result from response
    const toolSelectionResultFinalOutput = response.output
      ? createHookOutput('BeforeToolSelection', response.output)
      : undefined;

    // Apply tool configuration modifications
    if (toolSelectionResultFinalOutput) {
      const beforeToolSelectionOutput =
        toolSelectionResultFinalOutput as BeforeToolSelectionHookOutput;
      const modifiedConfig =
        beforeToolSelectionOutput.applyToolConfigModifications({
          toolConfig: llmRequest.config?.toolConfig,
          tools: llmRequest.config?.tools,
        });

      return {
        toolConfig: modifiedConfig.toolConfig,
        tools: modifiedConfig.tools,
      };
    }

    return {};
  } catch (error) {
    debugLogger.debug(`BeforeToolSelection hook failed:`, error);
    return {};
  }
}

/**
 * Fires the AfterModel hook and returns the result.
 *
 * @param messageBus The message bus to use for hook communication
 * @param originalRequest The original LLM request parameters
 * @param chunk The current response chunk from the model
 * @returns The hook result containing the response to yield
 */
export async function fireAfterModelHook(
  messageBus: MessageBus,
  originalRequest: GenerateContentParameters,
  chunk: GenerateContentResponse,
): Promise<AfterModelHookResult> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'AfterModel',
        input: {
          llm_request: originalRequest as unknown as Record<string, unknown>,
          llm_response: chunk as unknown as Record<string, unknown>,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    // Reconstruct result from response
    const afterResultFinalOutput = response.output
      ? createHookOutput('AfterModel', response.output)
      : undefined;

    const hookOutput = afterResultFinalOutput;

    // Check if hook requested to stop execution
    if (hookOutput?.shouldStopExecution()) {
      return {
        response: chunk,
        stopped: true,
        reason: hookOutput.getEffectiveReason(),
      };
    }

    // Check if hook blocked the model call
    const blockingError = hookOutput?.getBlockingError();
    if (blockingError?.blocked) {
      return {
        response: chunk,
        blocked: true,
        reason: hookOutput?.getEffectiveReason(),
      };
    }

    // Apply modifications from hook
    if (hookOutput) {
      const afterModelOutput = hookOutput as AfterModelHookOutput;
      const modifiedResponse = afterModelOutput.getModifiedResponse();
      if (modifiedResponse) {
        return { response: modifiedResponse };
      }
    }

    return { response: chunk };
  } catch (error) {
    debugLogger.debug(`AfterModel hook failed:`, error);
    // On error, return original chunk to avoid interrupting the stream.
    return { response: chunk };
  }
}
