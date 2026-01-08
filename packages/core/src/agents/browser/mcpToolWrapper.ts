/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Creates DeclarativeTool classes for MCP tools.
 *
 * These tools are ONLY registered in the browser agent's isolated ToolRegistry,
 * NOT in the main agent's registry. They dispatch to the BrowserManager's
 * isolated MCP client directly.
 *
 * Tool definitions are dynamically discovered from chrome-devtools-mcp
 * at runtime, not hardcoded.
 */

import type { FunctionDeclaration } from '@google/genai';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import {
  DeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolInvocation,
  type ToolCallConfirmationDetails,
} from '../../tools/tools.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { BrowserManager, McpToolCallResult } from './browserManager.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Tool invocation that dispatches to BrowserManager's isolated MCP client.
 */
class McpToolInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly toolName: string,
    params: Record<string, unknown>,
    messageBus: MessageBus,
  ) {
    super(params, messageBus, toolName, toolName);
  }

  getDescription(): string {
    return `Calling MCP tool: ${this.toolName}`;
  }

  /**
   * TODO: Remove this override once subagent tool confirmation is implemented
   * in the framework. Currently, subagent tools auto-approve by bypassing
   * the MessageBus confirmation flow. This matches how codebase_investigator
   * and other subagents work.
   */
  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      // Call the MCP tool via BrowserManager's isolated client
      const result: McpToolCallResult = await this.browserManager.callTool(
        this.toolName,
        this.params,
        signal,
      );

      // Extract text content from MCP response
      let textContent = '';
      if (result.content && Array.isArray(result.content)) {
        textContent = result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('\n');
      }

      if (result.isError) {
        return {
          llmContent: `Error: ${textContent}`,
          returnDisplay: `Error: ${textContent}`,
          error: { message: textContent },
        };
      }

      return {
        llmContent: textContent || 'Tool executed successfully.',
        returnDisplay: textContent || 'Tool executed successfully.',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`MCP tool ${this.toolName} failed: ${errorMsg}`);
      return {
        llmContent: `Error: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
        error: { message: errorMsg },
      };
    }
  }
}

/**
 * DeclarativeTool wrapper for an MCP tool.
 */
class McpDeclarativeTool extends DeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    name: string,
    description: string,
    parameterSchema: unknown,
    messageBus: MessageBus,
  ) {
    super(
      name,
      name,
      description,
      Kind.Other,
      parameterSchema,
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ false,
    );
  }

  build(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new McpToolInvocation(
      this.browserManager,
      this.name,
      params,
      this.messageBus,
    );
  }
}

/**
 * Creates DeclarativeTool instances from dynamically discovered MCP tools.
 *
 * These tools are registered in the browser agent's isolated ToolRegistry,
 * NOT in the main agent's registry.
 *
 * Tool definitions are fetched dynamically from the MCP server at runtime.
 *
 * @param browserManager The browser manager with isolated MCP client
 * @param messageBus Message bus for tool invocations
 * @returns Array of DeclarativeTools that dispatch to the isolated MCP client
 */
export async function createMcpDeclarativeTools(
  browserManager: BrowserManager,
  messageBus: MessageBus,
): Promise<McpDeclarativeTool[]> {
  // Get dynamically discovered tools from the MCP server
  const mcpTools = await browserManager.getDiscoveredTools();

  debugLogger.log(
    `Creating ${mcpTools.length} declarative tools for browser agent`,
  );

  return mcpTools.map((mcpTool) => {
    const schema = convertMcpToolToFunctionDeclaration(mcpTool);
    return new McpDeclarativeTool(
      browserManager,
      mcpTool.name,
      mcpTool.description ?? '',
      schema.parametersJsonSchema,
      messageBus,
    );
  });
}

/**
 * Converts MCP tool definition to Gemini FunctionDeclaration.
 */
function convertMcpToolToFunctionDeclaration(
  mcpTool: McpTool,
): FunctionDeclaration {
  // MCP tool inputSchema is a JSON Schema object
  // We pass it directly as parametersJsonSchema
  return {
    name: mcpTool.name,
    description: mcpTool.description ?? '',
    parametersJsonSchema: mcpTool.inputSchema ?? {
      type: 'object',
      properties: {},
    },
  };
}
