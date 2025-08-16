/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FileDiff,
  logToolCall,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolErrorType,
  ToolRegistry,
  ToolResult,
} from '../index.js';
import { Config } from '../config/config.js';
import { convertToFunctionResponse } from './coreToolScheduler.js';
import { ToolCallDecision } from '../telemetry/tool-call-decision.js';

/**
 * Executes a single tool call non-interactively.
 * It does not handle confirmations, multiple calls, or live updates.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<ToolCallResponseInfo> {
  const tool = toolRegistry.getTool(toolCallRequest.name);

  const startTime = Date.now();
  if (!tool) {
    const error = new Error(
      `Tool "${toolCallRequest.name}" not found in registry.`,
    );
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
    });
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
      errorType: ToolErrorType.TOOL_NOT_REGISTERED,
    };
  }

  try {
    // Directly execute without confirmation or live output handling
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const toolResult: ToolResult = await tool.buildAndExecute(
      toolCallRequest.args,
      effectiveAbortSignal,
      // No live output callback for non-interactive mode
    );

    const tool_output = toolResult.llmContent;

    const tool_display = toolResult.returnDisplay;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metadata: { [key: string]: any } = {};
    if (
      toolResult.error === undefined &&
      typeof tool_display === 'object' &&
      tool_display !== null &&
      'diffStat' in tool_display
    ) {
      const diffStat = (tool_display as FileDiff).diffStat;
      if (diffStat) {
        metadata = {
          ai_added_lines: diffStat.ai_added_lines,
          ai_removed_lines: diffStat.ai_removed_lines,
          user_added_lines: diffStat.user_added_lines,
          user_removed_lines: diffStat.user_removed_lines,
        };
      }
    }
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: toolResult.error === undefined,
      error:
        toolResult.error === undefined ? undefined : toolResult.error.message,
      error_type:
        toolResult.error === undefined ? undefined : toolResult.error.type,
      prompt_id: toolCallRequest.prompt_id,
      metadata,
      decision: ToolCallDecision.AUTO_ACCEPT,
    });

    const response = convertToFunctionResponse(
      toolCallRequest.name,
      toolCallRequest.callId,
      tool_output,
    );

    return {
      callId: toolCallRequest.callId,
      responseParts: response,
      resultDisplay: tool_display,
      error:
        toolResult.error === undefined
          ? undefined
          : new Error(toolResult.error.message),
      errorType:
        toolResult.error === undefined ? undefined : toolResult.error.type,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      error_type: ToolErrorType.UNHANDLED_EXCEPTION,
      prompt_id: toolCallRequest.prompt_id,
    });
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
      errorType: ToolErrorType.UNHANDLED_EXCEPTION,
    };
  }
}
