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
import { suspendInputBlocker, resumeInputBlocker } from './inputBlocker.js';
import { MCP_TOOL_PREFIX } from '../../tools/mcp-tool.js';
import { BROWSER_AGENT_NAME } from './browserAgentDefinition.js';

/**
 * Tools that interact with page elements and require the input blocker
 * overlay to be temporarily SUSPENDED (pointer-events: none) so
 * chrome-devtools-mcp's interactability checks pass.  The overlay
 * stays in the DOM — only the CSS property toggles, zero flickering.
 */
const INTERACTIVE_TOOLS = new Set([
  'click',
  'click_at',
  'fill',
  'fill_form',
  'hover',
  'drag',
  'upload_file',
]);

/**
 * Tool invocation that dispatches to BrowserManager's isolated MCP client.
 */
class McpToolInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    protected readonly browserManager: BrowserManager,
    protected readonly toolName: string,
    params: Record<string, unknown>,
    messageBus: MessageBus,
    private readonly shouldDisableInput: boolean,
    private readonly blockFileUploads: boolean = false,
  ) {
    super(
      params,
      messageBus,
      `${MCP_TOOL_PREFIX}${BROWSER_AGENT_NAME}_${toolName}`,
      toolName,
      BROWSER_AGENT_NAME,
    );
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
      serverName: BROWSER_AGENT_NAME,
      toolName: this.toolName,
      toolDisplayName: this.toolName,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        await this.publishPolicyUpdate(outcome);
      },
    };
  }

  override getPolicyUpdateOptions(
    _outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    return {
      mcpName: BROWSER_AGENT_NAME,
    };
  }

  /**
   * Whether this specific tool needs the input blocker suspended
   * (pointer-events toggled to 'none') before execution.
   */
  private get needsBlockerSuspend(): boolean {
    return this.shouldDisableInput && INTERACTIVE_TOOLS.has(this.toolName);
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      // Hard block for file uploads if configured
      if (this.blockFileUploads && this.toolName === 'upload_file') {
        const errorMsg = 'File uploads are blocked by configuration.';
        return {
          llmContent: `Error: ${errorMsg}`,
          returnDisplay: `Error: ${errorMsg}`,
          error: { message: errorMsg },
        };
      }

      // Suspend the input blocker for interactive tools so
      // chrome-devtools-mcp's interactability checks pass.
      // Only toggles pointer-events CSS — no DOM change, no flicker.
      if (this.needsBlockerSuspend) {
        await suspendInputBlocker(this.browserManager, signal);
      }

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

      // Resume input blocker after interactive tool completes.
      if (this.needsBlockerSuspend) {
        await resumeInputBlocker(this.browserManager, signal);
      }

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

      // Resume on error path too so the blocker is always restored
      if (this.needsBlockerSuspend) {
        await resumeInputBlocker(this.browserManager, signal).catch(() => {});
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
 * DeclarativeTool wrapper for an MCP tool.
 */
class McpDeclarativeTool extends DeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    protected readonly browserManager: BrowserManager,
    name: string,
    description: string,
    parameterSchema: unknown,
    messageBus: MessageBus,
    private readonly shouldDisableInput: boolean,
    private readonly blockFileUploads: boolean = false,
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

  // Used for determining tool identity in the policy engine to check if a tool
  // call is allowed based on policy.
  override get toolAnnotations(): Record<string, unknown> {
    return {
      _serverName: BROWSER_AGENT_NAME,
    };
  }

  build(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new McpToolInvocation(
      this.browserManager,
      this.name,
      params,
      this.messageBus,
      this.shouldDisableInput,
      this.blockFileUploads,
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
 * @param shouldDisableInput Whether input should be disabled for this agent
 * @returns Array of DeclarativeTools that dispatch to the isolated MCP client
 */
export async function createMcpDeclarativeTools(
  browserManager: BrowserManager,
  messageBus: MessageBus,
  shouldDisableInput: boolean = false,
  blockFileUploads: boolean = false,
): Promise<McpDeclarativeTool[]> {
  // Get dynamically discovered tools from the MCP server
  const mcpTools = await browserManager.getDiscoveredTools();

  debugLogger.log(
    `Creating ${mcpTools.length} declarative tools for browser agent` +
      (shouldDisableInput ? ' (input blocker enabled)' : ''),
  );

  const tools: McpDeclarativeTool[] = mcpTools.map((mcpTool) => {
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
      shouldDisableInput,
      blockFileUploads,
    );
  });

  debugLogger.log(
    `Total tools registered: ${tools.length} (${mcpTools.length} MCP)`,
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
