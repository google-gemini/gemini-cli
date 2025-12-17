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
import {
  createHookOutput,
  NotificationType,
  type DefaultHookOutput,
} from '../hooks/types.js';
import type {
  ToolCallConfirmationDetails,
  ToolResult,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { AnsiOutput, ShellExecutionConfig } from '../index.js';
import type { AnyToolInvocation } from '../tools/tools.js';
import { ShellToolInvocation } from '../tools/shell.js';

/**
 * Serializable representation of tool confirmation details for hooks.
 * Excludes function properties like onConfirm that can't be serialized.
 */
interface SerializableConfirmationDetails {
  type: 'edit' | 'exec' | 'mcp' | 'info';
  title: string;
  // Edit-specific fields
  fileName?: string;
  filePath?: string;
  fileDiff?: string;
  originalContent?: string | null;
  newContent?: string;
  isModifying?: boolean;
  // Exec-specific fields
  command?: string;
  rootCommand?: string;
  // MCP-specific fields
  serverName?: string;
  toolName?: string;
  toolDisplayName?: string;
  // Info-specific fields
  prompt?: string;
  urls?: string[];
}

/**
 * Converts ToolCallConfirmationDetails to a serializable format for hooks.
 * Excludes function properties (onConfirm, ideConfirmation) that can't be serialized.
 */
function toSerializableDetails(
  details: ToolCallConfirmationDetails,
): SerializableConfirmationDetails {
  const base: SerializableConfirmationDetails = {
    type: details.type,
    title: details.title,
  };

  switch (details.type) {
    case 'edit':
      return {
        ...base,
        fileName: details.fileName,
        filePath: details.filePath,
        fileDiff: details.fileDiff,
        originalContent: details.originalContent,
        newContent: details.newContent,
        isModifying: details.isModifying,
      };
    case 'exec':
      return {
        ...base,
        command: details.command,
        rootCommand: details.rootCommand,
      };
    case 'mcp':
      return {
        ...base,
        serverName: details.serverName,
        toolName: details.toolName,
        toolDisplayName: details.toolDisplayName,
      };
    case 'info':
      return {
        ...base,
        prompt: details.prompt,
        urls: details.urls,
      };
    default:
      return base;
  }
}

/**
 * Gets the message to display in the notification hook for tool confirmation.
 */
function getNotificationMessage(
  confirmationDetails: ToolCallConfirmationDetails,
): string {
  switch (confirmationDetails.type) {
    case 'edit':
      return `Tool ${confirmationDetails.title} requires editing`;
    case 'exec':
      return `Tool ${confirmationDetails.title} requires execution`;
    case 'mcp':
      return `Tool ${confirmationDetails.title} requires MCP`;
    case 'info':
      return `Tool ${confirmationDetails.title} requires information`;
    default:
      return `Tool requires confirmation`;
  }
}

/**
 * Fires the ToolPermission notification hook for a tool that needs confirmation.
 *
 * @param messageBus The message bus to use for hook communication
 * @param confirmationDetails The tool confirmation details
 */
export async function fireToolNotificationHook(
  messageBus: MessageBus,
  confirmationDetails: ToolCallConfirmationDetails,
): Promise<void> {
  try {
    const message = getNotificationMessage(confirmationDetails);
    const serializedDetails = toSerializableDetails(confirmationDetails);

    await messageBus.request<HookExecutionRequest, HookExecutionResponse>(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'Notification',
        input: {
          notification_type: NotificationType.ToolPermission,
          message,
          details: serializedDetails,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );
  } catch (error) {
    debugLogger.warn(
      `Notification hook failed for ${confirmationDetails.title}:`,
      error,
    );
  }
}

/**
 * Fires the BeforeTool hook and returns the hook output.
 *
 * @param messageBus The message bus to use for hook communication
 * @param toolName The name of the tool being executed
 * @param toolInput The input parameters for the tool
 * @returns The hook output, or undefined if no hook was executed or on error
 */
export async function fireBeforeToolHook(
  messageBus: MessageBus,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<DefaultHookOutput | undefined> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'BeforeTool',
        input: {
          tool_name: toolName,
          tool_input: toolInput,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    return response.output
      ? createHookOutput('BeforeTool', response.output)
      : undefined;
  } catch (error) {
    debugLogger.warn(`BeforeTool hook failed for ${toolName}:`, error);
    return undefined;
  }
}

/**
 * Fires the AfterTool hook and returns the hook output.
 *
 * @param messageBus The message bus to use for hook communication
 * @param toolName The name of the tool that was executed
 * @param toolInput The input parameters for the tool
 * @param toolResponse The result from the tool execution
 * @returns The hook output, or undefined if no hook was executed or on error
 */
export async function fireAfterToolHook(
  messageBus: MessageBus,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: {
    llmContent: ToolResult['llmContent'];
    returnDisplay: ToolResult['returnDisplay'];
    error: ToolResult['error'];
  },
): Promise<DefaultHookOutput | undefined> {
  try {
    const response = await messageBus.request<
      HookExecutionRequest,
      HookExecutionResponse
    >(
      {
        type: MessageBusType.HOOK_EXECUTION_REQUEST,
        eventName: 'AfterTool',
        input: {
          tool_name: toolName,
          tool_input: toolInput,
          tool_response: toolResponse,
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    return response.output
      ? createHookOutput('AfterTool', response.output)
      : undefined;
  } catch (error) {
    debugLogger.warn(`AfterTool hook failed for ${toolName}:`, error);
    return undefined;
  }
}

/**
 * Execute a tool with BeforeTool and AfterTool hooks.
 *
 * @param invocation The tool invocation to execute
 * @param toolName The name of the tool
 * @param signal Abort signal for cancellation
 * @param messageBus Optional message bus for hook communication
 * @param hooksEnabled Whether hooks are enabled
 * @param liveOutputCallback Optional callback for live output updates
 * @param shellExecutionConfig Optional shell execution config
 * @param setPidCallback Optional callback to set the PID for shell invocations
 * @returns The tool result
 */
export async function executeToolWithHooks(
  invocation: ShellToolInvocation | AnyToolInvocation,
  toolName: string,
  signal: AbortSignal,
  messageBus: MessageBus | undefined,
  hooksEnabled: boolean,
  liveOutputCallback?: (outputChunk: string | AnsiOutput) => void,
  shellExecutionConfig?: ShellExecutionConfig,
  setPidCallback?: (pid: number) => void,
): Promise<ToolResult> {
  const toolInput = (invocation.params || {}) as Record<string, unknown>;

  // Fire BeforeTool hook through MessageBus (only if hooks are enabled)
  if (hooksEnabled && messageBus) {
    const beforeOutput = await fireBeforeToolHook(
      messageBus,
      toolName,
      toolInput,
    );

    // Check if hook blocked the tool execution
    const blockingError = beforeOutput?.getBlockingError();
    if (blockingError?.blocked) {
      return {
        llmContent: `Tool execution blocked: ${blockingError.reason}`,
        returnDisplay: `Tool execution blocked: ${blockingError.reason}`,
        error: {
          type: ToolErrorType.EXECUTION_FAILED,
          message: blockingError.reason,
        },
      };
    }

    // Check if hook requested to stop entire agent execution
    if (beforeOutput?.shouldStopExecution()) {
      const reason = beforeOutput.getEffectiveReason();
      return {
        llmContent: `Agent execution stopped by hook: ${reason}`,
        returnDisplay: `Agent execution stopped by hook: ${reason}`,
        error: {
          type: ToolErrorType.EXECUTION_FAILED,
          message: `Agent execution stopped: ${reason}`,
        },
      };
    }
  }

  // Execute the actual tool
  let toolResult: ToolResult;
  if (setPidCallback && invocation instanceof ShellToolInvocation) {
    toolResult = await invocation.execute(
      signal,
      liveOutputCallback,
      shellExecutionConfig,
      setPidCallback,
    );
  } else {
    toolResult = await invocation.execute(
      signal,
      liveOutputCallback,
      shellExecutionConfig,
    );
  }

  // Fire AfterTool hook through MessageBus (only if hooks are enabled)
  if (hooksEnabled && messageBus) {
    const afterOutput = await fireAfterToolHook(
      messageBus,
      toolName,
      toolInput,
      {
        llmContent: toolResult.llmContent,
        returnDisplay: toolResult.returnDisplay,
        error: toolResult.error,
      },
    );

    // Check if hook requested to stop entire agent execution
    if (afterOutput?.shouldStopExecution()) {
      const reason = afterOutput.getEffectiveReason();
      return {
        llmContent: `Agent execution stopped by hook: ${reason}`,
        returnDisplay: `Agent execution stopped by hook: ${reason}`,
        error: {
          type: ToolErrorType.EXECUTION_FAILED,
          message: `Agent execution stopped: ${reason}`,
        },
      };
    }

    // Add additional context from hooks to the tool result
    const additionalContext = afterOutput?.getAdditionalContext();
    if (additionalContext) {
      if (typeof toolResult.llmContent === 'string') {
        toolResult.llmContent += '\n\n' + additionalContext;
      } else if (Array.isArray(toolResult.llmContent)) {
        toolResult.llmContent.push({ text: '\n\n' + additionalContext });
      } else if (toolResult.llmContent) {
        // Handle single Part case by converting to an array
        toolResult.llmContent = [
          toolResult.llmContent,
          { text: '\n\n' + additionalContext },
        ];
      } else {
        toolResult.llmContent = additionalContext;
      }
    }
  }

  return toolResult;
}
