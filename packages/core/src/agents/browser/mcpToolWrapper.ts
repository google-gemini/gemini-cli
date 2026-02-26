/**
 * @license
 * Copyright 2026 Google LLC
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
  type ToolConfirmationOutcome,
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
      const callToolPromise = this.browserManager.callTool(
        this.toolName,
        this.params,
        signal,
      );

      const result: McpToolCallResult = await callToolPromise;

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

      // Chrome connection errors are fatal — re-throw to terminate the agent
      // immediately instead of returning a result the LLM would retry.
      if (errorMsg.includes('Could not connect to Chrome')) {
        throw error;
      }

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
 * Composite tool invocation that types a full string by calling press_key
 * for each character internally, avoiding N model round-trips.
 */
class TypeTextInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly text: string,
    private readonly submitKey: string | undefined,
    messageBus: MessageBus,
  ) {
    super({ text, submitKey }, messageBus, 'type_text', 'type_text');
  }

  getDescription(): string {
    const preview = `"${this.text.substring(0, 50)}${this.text.length > 50 ? '...' : ''}"`;
    return this.submitKey
      ? `type_text: ${preview} + ${this.submitKey}`
      : `type_text: ${preview}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (!this.messageBus) {
      return false;
    }

    return {
      type: 'mcp',
      title: `Confirm Tool: type_text`,
      serverName: 'browser-agent',
      toolName: 'type_text',
      toolDisplayName: 'type_text',
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

  override async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      if (signal.aborted) {
        return {
          llmContent: 'Error: Operation cancelled before typing started.',
          returnDisplay: 'Operation cancelled before typing started.',
          error: { message: 'Operation cancelled' },
        };
      }

      await this.typeCharByChar(signal);

      // Optionally press a submit key (Enter, Tab, etc.) after typing
      if (this.submitKey && !signal.aborted) {
        const keyResult = await this.browserManager.callTool(
          'press_key',
          { key: this.submitKey },
          signal,
        );
        if (keyResult.isError) {
          const errText = this.extractErrorText(keyResult);
          debugLogger.warn(
            `type_text: submitKey("${this.submitKey}") failed: ${errText}`,
          );
        }
      }

      const summary = this.submitKey
        ? `Successfully typed "${this.text}" and pressed ${this.submitKey}`
        : `Successfully typed "${this.text}"`;

      return {
        llmContent: summary,
        returnDisplay: summary,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Chrome connection errors are fatal
      if (errorMsg.includes('Could not connect to Chrome')) {
        throw error;
      }

      debugLogger.error(`type_text failed: ${errorMsg}`);
      return {
        llmContent: `Error: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
        error: { message: errorMsg },
      };
    }
  }

  /** Types each character via individual press_key MCP calls. */
  private async typeCharByChar(signal: AbortSignal): Promise<void> {
    const chars = [...this.text]; // Handle Unicode correctly
    for (const char of chars) {
      if (signal.aborted) return;

      // Map special characters to key names
      const key = char === ' ' ? 'Space' : char;
      const result = await this.browserManager.callTool(
        'press_key',
        { key },
        signal,
      );

      if (result.isError) {
        debugLogger.warn(
          `type_text: press_key("${key}") failed: ${this.extractErrorText(result)}`,
        );
      }
    }
  }

  /** Extract error text from an MCP tool result. */
  private extractErrorText(result: McpToolCallResult): string {
    return (
      result.content
        ?.filter(
          (c: { type: string; text?: string }) => c.type === 'text' && c.text,
        )
        .map((c: { type: string; text?: string }) => c.text)
        .join('\n') || 'Unknown error'
    );
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
 * DeclarativeTool for the custom type_text composite tool.
 */
class TypeTextDeclarativeTool extends DeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    messageBus: MessageBus,
  ) {
    super(
      'type_text',
      'type_text',
      'Types a full text string into the currently focused element. ' +
        'Much faster than calling press_key for each character individually. ' +
        'Use this to enter text into form fields, search boxes, spreadsheet cells, or any focused input. ' +
        'The element must already be focused (e.g., after a click). ' +
        'Use submitKey to press a key after typing (e.g., submitKey="Enter" to submit a form or confirm a value, submitKey="Tab" to move to the next field).',
      Kind.Other,
      {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to type into the focused element.',
          },
          submitKey: {
            type: 'string',
            description:
              'Optional key to press after typing (e.g., "Enter", "Tab", "Escape"). ' +
              'Useful for submitting form fields or moving to the next cell in a spreadsheet.',
          },
        },
        required: ['text'],
      },
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ false,
    );
  }

  build(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    const submitKey =
      typeof params['submitKey'] === 'string' && params['submitKey']
        ? params['submitKey']
        : undefined;
    return new TypeTextInvocation(
      this.browserManager,
      String(params['text'] ?? ''),
      submitKey,
      this.messageBus,
    );
  }
}

/**
 * Creates DeclarativeTool instances from dynamically discovered MCP tools,
 * plus custom composite tools (like type_text).
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
): Promise<Array<McpDeclarativeTool | TypeTextDeclarativeTool>> {
  // Get dynamically discovered tools from the MCP server
  const mcpTools = await browserManager.getDiscoveredTools();

  debugLogger.log(
    `Creating ${mcpTools.length} declarative tools for browser agent`,
  );

  const tools: Array<McpDeclarativeTool | TypeTextDeclarativeTool> =
    mcpTools.map((mcpTool) => {
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

  // Add custom composite tools
  tools.push(new TypeTextDeclarativeTool(browserManager, messageBus));

  debugLogger.log(
    `Total tools registered: ${tools.length} (${mcpTools.length} MCP + 1 custom)`,
  );

  return tools;
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
 * Augments MCP tool descriptions with usage guidance.
 * Adds semantic hints and usage rules directly in tool descriptions
 * so the model makes correct tool choices without system prompt overhead.
 *
 * Actual chrome-devtools-mcp tools:
 *   Input: click, drag, fill, fill_form, handle_dialog, hover, press_key, upload_file
 *   Navigation: close_page, list_pages, navigate_page, new_page, select_page, wait_for
 *   Emulation: emulate, resize_page
 *   Performance: performance_analyze_insight, performance_start_trace, performance_stop_trace
 *   Network: get_network_request, list_network_requests
 *   Debugging: evaluate_script, get_console_message, list_console_messages, take_screenshot, take_snapshot
 *   Vision (--experimental-vision): click_at, analyze_screenshot
 */
function augmentToolDescription(toolName: string, description: string): string {
  // More-specific keys MUST come before shorter keys to prevent
  // partial matching from short-circuiting (e.g., fill_form before fill).
  const hints: Record<string, string> = {
    fill_form:
      ' Fills multiple standard HTML form fields at once. Same limitations as fill — does not work on canvas/custom widgets.',
    fill: ' Fills standard HTML form fields (<input>, <textarea>, <select>) by uid. Does NOT work on custom/canvas-based widgets (e.g., Google Sheets cells, Notion blocks). If fill times out or fails, click the element first then use press_key with individual characters instead.',
    click_at:
      ' Clicks at exact pixel coordinates (x, y). Use when you have specific coordinates for visual elements.',
    click:
      ' Use the element uid from the accessibility tree snapshot (e.g., uid="87_4"). UIDs are invalidated after this action — call take_snapshot before using another uid.',
    hover:
      ' Use the element uid from the accessibility tree snapshot to hover over elements.',
    take_snapshot:
      ' Returns the accessibility tree with uid values for each element. Call this FIRST to see available elements, and AFTER every state-changing action (click, fill, press_key) before using any uid.',
    navigate_page:
      ' Navigate to the specified URL. Call take_snapshot after to see the new page.',
    new_page:
      ' Opens a new page/tab with the specified URL. Call take_snapshot after to see the new page.',
    press_key:
      ' Press a SINGLE keyboard key (e.g., "Enter", "Tab", "Escape", "ArrowDown", "a", "8"). ONLY accepts one key name — do NOT pass multi-character strings like "Hello" or "A1\\nEnter". To type text, use type_text instead of calling press_key for each character.',
  };

  // Check for partial matches — order matters! More-specific keys first.
  for (const [key, hint] of Object.entries(hints)) {
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
