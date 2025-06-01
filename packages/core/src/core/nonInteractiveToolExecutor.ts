/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Part } from '@google/genai';
import {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolRegistry,
  ToolResult,
} from '../index.js';
import { formatLlmContentForFunctionResponse } from './coreToolScheduler.js';

/**
 * Executes a single tool call non-interactively.
 * It does not handle confirmations, multiple calls, or live updates.
 */
export async function executeToolCall(
  toolCallRequest: ToolCallRequestInfo,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<ToolCallResponseInfo> {
  const tool = toolRegistry.getTool(toolCallRequest.name);

  if (!tool) {
    const error = new Error(
      `Tool "${toolCallRequest.name}" not found in registry.`,
    );
    // Ensure the response structure matches what the API expects for an error
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }

  try {
    // Directly execute without confirmation or live output handling
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const toolResult: ToolResult = await tool.execute(
      toolCallRequest.args,
      effectiveAbortSignal,
      // No live output callback for non-interactive mode
    );

    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(toolResult.llmContent);

    const functionResponsePart: Part = {
      functionResponse: {
        name: toolCallRequest.name,
        id: toolCallRequest.callId,
        response: functionResponseJson,
      },
    };

    return {
      callId: toolCallRequest.callId,
      responseParts: [functionResponsePart, ...additionalParts],
      resultDisplay: toolResult.returnDisplay,
      error: undefined,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }
}
