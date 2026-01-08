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
import type { ToolConfirmationOutcome } from '../../tools/tools.js';
import {
  DeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolInvocation,
  type ToolCallConfirmationDetails,
  type PolicyUpdateOptions,
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

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (!this.messageBus) {
      return false;
    }

    return {
      type: 'mcp',
      title: `Confirm MCP Tool: ${this.toolName}`,
      serverName: 'browser-agent',
      toolName: this.toolName,
      toolDisplayName: this.toolName,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        await this.publishPolicyUpdate(outcome);
      },
    };
  }

  protected override getPolicyUpdateOptions(
    _outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    return {
      mcpName: 'browser-agent',
    };
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

      // Post-process to add contextual hints for common error patterns
      const processedContent = postProcessToolResult(
        this.toolName,
        textContent,
      );

      if (result.isError) {
        return {
          llmContent: `Error: ${processedContent}`,
          returnDisplay: `Error: ${processedContent}`,
          error: { message: textContent },
        };
      }

      return {
        llmContent: processedContent || 'Tool executed successfully.',
        returnDisplay: processedContent || 'Tool executed successfully.',
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
    // Augment description with uid-context hints
    const augmentedDescription = augmentToolDescription(
      mcpTool.name,
      mcpTool.description ?? '',
    );
    return new McpDeclarativeTool(
      browserManager,
      mcpTool.name,
      augmentedDescription,
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

/**
 * Augments MCP tool descriptions with uid-context hints.
 * Adds semantic guidance for tools that work with accessibility tree elements.
 */
function augmentToolDescription(toolName: string, description: string): string {
  const uidHints: Record<string, string> = {
    click:
      ' Use the element uid from the accessibility tree snapshot (e.g., uid="87_4" for a button).',
    fill: ' Use the element uid from the accessibility tree snapshot for input/select elements.',
    hover:
      ' Use the element uid from the accessibility tree snapshot to hover over elements.',
    type: ' Type text into the currently focused element.',
    scroll:
      ' Scroll the page in the specified direction. Use after take_snapshot to see more content.',
    take_snapshot:
      ' Returns the accessibility tree with uid values for each element. Call this first to see available elements.',
    navigate_page:
      ' Navigate to the specified URL. Call take_snapshot after to see the new page.',
    new_page:
      ' Opens a new page/tab with the specified URL. Call take_snapshot after to see the new page.',
    press_key:
      ' Press a keyboard key. Use for Enter, Tab, Escape, arrow keys, etc.',
  };

  // Check for partial matches (e.g., "click" matches "click_element")
  for (const [key, hint] of Object.entries(uidHints)) {
    if (toolName.toLowerCase().includes(key)) {
      return description + hint;
    }
  }

  return description;
}

/**
 * Post-processes tool results to add contextual hints for common error patterns.
 * This helps the agent recover from overlay blocking, element not found, etc.
 * Also strips embedded snapshots to prevent token bloat.
 */
export function postProcessToolResult(
  toolName: string,
  result: string,
): string {
  // Strip embedded snapshots to prevent token bloat (except for take_snapshot,
  // whose accessibility tree the model needs for uid-based interactions).
  let processedResult = result;

  if (
    toolName !== 'take_snapshot' &&
    result.includes('## Latest page snapshot')
  ) {
    const parts = result.split('## Latest page snapshot');
    processedResult = parts[0].trim();
    if (parts[1]) {
      debugLogger.log('Stripped embedded snapshot from tool response');
    }
  }

  // Detect overlay/interactable issues
  const overlayPatterns = [
    'not interactable',
    'obscured',
    'intercept',
    'blocked',
    'element is not visible',
    'element not found',
  ];

  const isOverlayIssue = overlayPatterns.some((pattern) =>
    processedResult.toLowerCase().includes(pattern),
  );

  if (isOverlayIssue && (toolName === 'click' || toolName.includes('click'))) {
    return (
      processedResult +
      '\n\n⚠️ This action may have been blocked by an overlay, popup, or tooltip. ' +
      'Look for close/dismiss buttons (×, Close, "Got it", "Accept") in the accessibility tree and click them first.'
    );
  }

  // Detect stale element references
  if (
    processedResult.toLowerCase().includes('stale') ||
    processedResult.toLowerCase().includes('detached')
  ) {
    return (
      processedResult +
      '\n\n⚠️ The element reference is stale. Call take_snapshot to get fresh element uids.'
    );
  }

  return processedResult;
}
