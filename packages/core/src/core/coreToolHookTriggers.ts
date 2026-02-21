/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type McpToolContext, BeforeToolHookOutput } from '../hooks/types.js';
import type { Config } from '../config/config.js';
import type {
  ToolResult,
  AnyDeclarativeTool,
  AnyToolInvocation,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { AnsiOutput, ShellExecutionConfig } from '../index.js';
import { ShellToolInvocation } from '../tools/shell.js';
import { DiscoveredMCPToolInvocation } from '../tools/mcp-tool.js';

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
 * Execute a tool with BeforeTool and AfterTool hooks.
 *
 * @param invocation The tool invocation to execute
 * @param toolName The name of the tool
 * @param signal Abort signal for cancellation
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
  tool: AnyDeclarativeTool,
  liveOutputCallback?: (outputChunk: string | AnsiOutput) => void,
  shellExecutionConfig?: ShellExecutionConfig,
  setPidCallback?: (pid: number) => void,
  config?: Config,
): Promise<ToolResult> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const toolInput = (invocation.params || {}) as Record<string, unknown>;
  let inputWasModified = false;
  let modifiedKeys: string[] = [];

  // Extract MCP context if this is an MCP tool (only if config is provided)
  const mcpContext = config ? extractMcpContext(invocation, config) : undefined;

  const hookSystem = config?.getHookSystem();
  if (hookSystem) {
    const beforeOutput = await hookSystem.fireBeforeToolEvent(
      toolName,
      toolInput,
      mcpContext,
    );

    // Check if hook requested to stop entire agent execution
    if (beforeOutput?.shouldStopExecution()) {
      const reason = beforeOutput.getEffectiveReason();
      return {
        llmContent: `Agent execution stopped by hook: ${reason}`,
        returnDisplay: `Agent execution stopped by hook: ${reason}`,
        error: {
          type: ToolErrorType.STOP_EXECUTION,
          message: reason,
        },
      };
    }

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

    // Check if hook requested to update tool input
    if (beforeOutput instanceof BeforeToolHookOutput) {
      const modifiedInput = beforeOutput.getModifiedToolInput();
      if (modifiedInput) {
        // We modify the toolInput object in-place, which should be the same reference as invocation.params
        // We use Object.assign to update properties
        Object.assign(invocation.params, modifiedInput);
        debugLogger.debug(`Tool input modified by hook for ${toolName}`);
        inputWasModified = true;
        modifiedKeys = Object.keys(modifiedInput);

        // Recreate the invocation with the new parameters
        // to ensure any derived state (like resolvedPath in ReadFileTool) is updated.
        try {
          // We use the tool's build method to validate and create the invocation
          // This ensures consistent behavior with the initial creation
          invocation = tool.build(invocation.params);
        } catch (error) {
          return {
            llmContent: `Tool parameter modification by hook failed validation: ${
              error instanceof Error ? error.message : String(error)
            }`,
            returnDisplay: `Tool parameter modification by hook failed validation.`,
            error: {
              type: ToolErrorType.INVALID_TOOL_PARAMS,
              message: String(error),
            },
          };
        }
      }
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

  // Append notification if parameters were modified
  if (inputWasModified) {
    const modificationMsg = `\n\n[System] Tool input parameters (${modifiedKeys.join(
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

  if (hookSystem) {
    const afterOutput = await hookSystem.fireAfterToolEvent(
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
      const wrappedContext = `\n\n<hook_context>${additionalContext}</hook_context>`;
      if (typeof toolResult.llmContent === 'string') {
        toolResult.llmContent += wrappedContext;
      } else if (Array.isArray(toolResult.llmContent)) {
        toolResult.llmContent.push({ text: wrappedContext });
      } else if (toolResult.llmContent) {
        // Handle single Part case by converting to an array
        toolResult.llmContent = [
          toolResult.llmContent,
          { text: wrappedContext },
        ];
      } else {
        toolResult.llmContent = wrappedContext;
      }
    }
  }

  return toolResult;
}
