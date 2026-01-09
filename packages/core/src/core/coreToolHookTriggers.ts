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
  type McpToolContext,
} from '../hooks/types.js';
import type { Config } from '../config/config.js';
import type {
  ToolCallConfirmationDetails,
  ToolResult,
  AnyDeclarativeTool,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { AnsiOutput, ShellExecutionConfig } from '../index.js';
import type { AnyToolInvocation } from '../tools/tools.js';
import { ShellToolInvocation } from '../tools/shell.js';
import { DiscoveredMCPToolInvocation } from '../tools/mcp-tool.js';
import type { InputModificationInfo } from '../scheduler/types.js';

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
    debugLogger.debug(
      `Notification hook failed for ${confirmationDetails.title}:`,
      error,
    );
  }
}

/**
 * Extracts MCP context from a tool invocation if it's an MCP tool.
 *
 * @param invocation The tool invocation
 * @param config Config to look up server details
 * @returns MCP context if this is an MCP tool, undefined otherwise
 */
function extractMcpContext(
  invocation: ShellToolInvocation | AnyToolInvocation,
  config: Config,
): McpToolContext | undefined {
  if (!(invocation instanceof DiscoveredMCPToolInvocation)) {
    return undefined;
  }

  // Get the server config
  const mcpServers =
    config.getMcpClientManager()?.getMcpServers() ??
    config.getMcpServers() ??
    {};
  const serverConfig = mcpServers[invocation.serverName];
  if (!serverConfig) {
    return undefined;
  }

  return {
    server_name: invocation.serverName,
    tool_name: invocation.serverToolName,
    // Non-sensitive connection details only
    command: serverConfig.command,
    args: serverConfig.args,
    cwd: serverConfig.cwd,
    url: serverConfig.url ?? serverConfig.httpUrl,
    tcp: serverConfig.tcp,
  };
}

/**
 * Fires the BeforeTool hook and returns the hook output.
 *
 * @param messageBus The message bus to use for hook communication
 * @param toolName The name of the tool being executed
 * @param toolInput The input parameters for the tool
 * @param mcpContext Optional MCP context for MCP tools
 * @returns The hook output, or undefined if no hook was executed or on error
 */
export async function fireBeforeToolHook(
  messageBus: MessageBus,
  toolName: string,
  toolInput: Record<string, unknown>,
  mcpContext?: McpToolContext,
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
          ...(mcpContext && { mcp_context: mcpContext }),
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    return response.output
      ? createHookOutput('BeforeTool', response.output)
      : undefined;
  } catch (error) {
    debugLogger.debug(`BeforeTool hook failed for ${toolName}:`, error);
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
 * @param mcpContext Optional MCP context for MCP tools
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
  mcpContext?: McpToolContext,
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
          ...(mcpContext && { mcp_context: mcpContext }),
        },
      },
      MessageBusType.HOOK_EXECUTION_RESPONSE,
    );

    return response.output
      ? createHookOutput('AfterTool', response.output)
      : undefined;
  } catch (error) {
    debugLogger.debug(`AfterTool hook failed for ${toolName}:`, error);
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
 * @param config Config to look up MCP server details for hook context
 * @returns The tool result
 */
export async function executeToolWithHooks(
  invocation: ShellToolInvocation | AnyToolInvocation,
  toolName: string,
  signal: AbortSignal,
  messageBus: MessageBus | undefined,
  hooksEnabled: boolean,
  tool: AnyDeclarativeTool,
  liveOutputCallback?: (outputChunk: string | AnsiOutput) => void,
  shellExecutionConfig?: ShellExecutionConfig,
  setPidCallback?: (pid: number) => void,
  config?: Config,
  inputModification?: InputModificationInfo,
): Promise<ToolResult> {
  const toolInput = (invocation.params || {}) as Record<string, unknown>;

  // Extract MCP context if this is an MCP tool (only if config is provided)
  const mcpContext = config ? extractMcpContext(invocation, config) : undefined;

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

  // Append notification if parameters were modified
  if (inputModification?.wasModified) {
    const modificationMsg = `\n\n[System] Tool input parameters (${inputModification.modifiedKeys.join(
      ', ',
    )}) were modified by a hook before execution.`;
    if (typeof toolResult.llmContent === 'string') {
      toolResult.llmContent += modificationMsg;
    } else if (Array.isArray(toolResult.llmContent)) {
      toolResult.llmContent.push({ text: modificationMsg });
    } else if (toolResult.llmContent) {
      // Handle single Part case by converting to an array
      toolResult.llmContent = [
        toolResult.llmContent,
        { text: modificationMsg },
      ];
    }
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
      mcpContext,
    );

    // Check if hook requested to stop entire agent execution
    if (afterOutput?.shouldStopExecution()) {
      const reason = afterOutput.getEffectiveReason();
      return {
        llmContent: `Agent execution stopped by hook: ${reason}`,
        returnDisplay: `Agent execution stopped by hook: ${reason}`,
        error: {
          type: ToolErrorType.STOP_EXECUTION,
          message: reason,
        },
      };
    }

    // Check if hook blocked the tool result
    const blockingError = afterOutput?.getBlockingError();
    if (blockingError?.blocked) {
      return {
        llmContent: `Tool result blocked: ${blockingError.reason}`,
        returnDisplay: `Tool result blocked: ${blockingError.reason}`,
        error: {
          type: ToolErrorType.EXECUTION_FAILED,
          message: blockingError.reason,
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
