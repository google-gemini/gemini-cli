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
  ToolLiveOutput,
  ExecuteOptions,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { DiscoveredMCPToolInvocation } from '../tools/mcp-tool.js';
import { debugLogger } from '../utils/debugLogger.js';
import { scanAndRedact, summarizeSecrets } from '../safety/secret-scanner.js';
import { sanitizeExternalContent } from '../safety/content-sanitizer.js';

/**
 * Extracts MCP context from a tool invocation if it's an MCP tool.
 *
 * @param invocation The tool invocation
 * @param config Config to look up server details
 * @returns MCP context if this is an MCP tool, undefined otherwise
 */
export function extractMcpContext(
  invocation: AnyToolInvocation,
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
 * @param options Optional execution options (shell config, execution ID callback, etc.)
 * @param config Config to look up MCP server details for hook context
 * @returns The tool result
 */
export async function executeToolWithHooks(
  invocation: AnyToolInvocation,
  toolName: string,
  signal: AbortSignal,
  tool: AnyDeclarativeTool,
  liveOutputCallback?: (outputChunk: ToolLiveOutput) => void,
  options?: Omit<ExecuteOptions, 'abortSignal' | 'updateOutput'>,
  config?: Config,
  originalRequestName?: string,
  skipBeforeHook?: boolean,
): Promise<ToolResult> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const toolInput = (invocation.params || {}) as Record<string, unknown>;
  let inputWasModified = false;
  let modifiedKeys: string[] = [];

  // Extract MCP context if this is an MCP tool (only if config is provided)
  const mcpContext = config ? extractMcpContext(invocation, config) : undefined;
  const hookSystem = config?.getHookSystem();

  if (hookSystem && !skipBeforeHook) {
    const beforeOutput = await hookSystem.fireBeforeToolEvent(
      toolName,
      toolInput,
      mcpContext,
      originalRequestName,
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

  // Execute the actual tool. Tools that support backgrounding can optionally
  // surface an execution ID via the callback.
  const toolResult: ToolResult = await invocation.execute({
    ...options,
    abortSignal: signal,
    updateOutput: liveOutputCallback,
  });

  // Apply security processors to tool results before they enter the context window.
  if (config) {
    applySecurityProcessors(toolResult, toolName, invocation, config);
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
      originalRequestName,
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

    // Check if the hook requested a tail tool call
    const tailToolCallRequest = afterOutput?.getTailToolCallRequest();
    if (tailToolCallRequest) {
      toolResult.tailToolCallRequest = tailToolCallRequest;
    }
  }

  return toolResult;
}

/** Tools whose outputs may contain user credentials and should be secret-scanned. */
const SECRET_SCAN_TOOLS = new Set([
  'read_file',
  'read_many_files',
  'grep',
  'run_shell_command',
]);

/** Tools that fetch external/untrusted content and should be content-sanitized. */
const CONTENT_SANITIZE_TOOLS = new Set(['web_fetch']);

function applyStringTransform(
  content: ToolResult['llmContent'],
  transform: (s: string) => string,
): ToolResult['llmContent'] {
  if (typeof content === 'string') {
    return transform(content);
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
        return { ...part, text: transform(part.text) };
      }
      return part;
    });
  }
  return content;
}

function applySecurityProcessors(
  toolResult: ToolResult,
  toolName: string,
  invocation: AnyToolInvocation,
  config: Config,
): void {
  // Secret scanning — silently redact credentials, surface notice in returnDisplay
  if (config.enableSecretScanning && SECRET_SCAN_TOOLS.has(toolName)) {
    const original =
      typeof toolResult.llmContent === 'string' ? toolResult.llmContent : '';
    if (original) {
      const { matches, sanitized } = scanAndRedact(original);
      if (matches.length > 0) {
        toolResult.llmContent = sanitized;
        const summary = summarizeSecrets(matches);
        const notice = `\n⚠ Secret scanning: ${summary} redacted from ${toolName} output.`;
        if (typeof toolResult.returnDisplay === 'string') {
          toolResult.returnDisplay += notice;
        } else {
          toolResult.returnDisplay = notice;
        }
      }
    }
  }

  // Content sanitization — strip injection patterns from external content.
  // Also applies to MCP tool results from untrusted servers.
  const isMcpUntrusted =
    invocation instanceof DiscoveredMCPToolInvocation &&
    !config.getMcpServers()?.[invocation.serverName]?.trust;
  if (
    config.enableContentSanitization &&
    (CONTENT_SANITIZE_TOOLS.has(toolName) || isMcpUntrusted)
  ) {
    toolResult.llmContent = applyStringTransform(
      toolResult.llmContent,
      (text) => {
        const { sanitized, warnings } = sanitizeExternalContent(text);
        if (warnings.length > 0) {
          const warningMsg = `\n⚠ Content sanitization: ${warnings.join(' ')}`;
          if (typeof toolResult.returnDisplay === 'string') {
            toolResult.returnDisplay += warningMsg;
          } else {
            toolResult.returnDisplay = warningMsg;
          }
        }
        return sanitized;
      },
    );
  }
}
