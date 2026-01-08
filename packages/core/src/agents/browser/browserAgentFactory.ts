/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Factory for creating browser agent definitions with configured tools.
 *
 * This factory is called when the browser agent is invoked via delegate_to_agent.
 * It creates a BrowserManager, connects the isolated MCP client, wraps tools,
 * and returns a fully configured LocalAgentDefinition.
 *
 * IMPORTANT: The MCP tools are ONLY available to the browser agent's isolated
 * registry. They are NOT registered in the main agent's ToolRegistry.
 */

import type { Config } from '../../config/config.js';
import { AuthType } from '../../core/contentGenerator.js';
import type { LocalAgentDefinition } from '../types.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { AnyDeclarativeTool } from '../../tools/tools.js';
import { BrowserManager } from './browserManager.js';
import {
  BrowserAgentDefinition,
  type BrowserTaskResultSchema,
} from './browserAgentDefinition.js';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import { createAnalyzeScreenshotTool } from './analyzeScreenshot.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Creates a browser agent definition with MCP tools configured.
 *
 * This is called when the browser agent is invoked via delegate_to_agent.
 * The MCP client is created fresh and tools are wrapped for the agent's
 * isolated registry - NOT registered with the main agent.
 *
 * @param config Runtime configuration
 * @param messageBus Message bus for tool invocations
 * @param printOutput Optional callback for progress messages
 * @returns Fully configured LocalAgentDefinition with MCP tools
 */
export async function createBrowserAgentDefinition(
  config: Config,
  messageBus: MessageBus,
  printOutput?: (msg: string) => void,
): Promise<{
  definition: LocalAgentDefinition<typeof BrowserTaskResultSchema>;
  browserManager: BrowserManager;
}> {
  debugLogger.log(
    'Creating browser agent definition with isolated MCP tools...',
  );

  // Create and initialize browser manager with isolated MCP client
  const browserManager = new BrowserManager(config);
  await browserManager.ensureConnection();

  if (printOutput) {
    printOutput('Browser connected with isolated MCP client.');
  }

  // Create declarative tools from dynamically discovered MCP tools
  // These tools dispatch to browserManager's isolated client
  const mcpTools = await createMcpDeclarativeTools(browserManager, messageBus);
  const availableToolNames = mcpTools.map((t) => t.name);

  // Validate required semantic tools are available
  const requiredSemanticTools = [
    'click',
    'fill',
    'navigate_page',
    'take_snapshot',
  ];
  const missingSemanticTools = requiredSemanticTools.filter(
    (t) => !availableToolNames.includes(t),
  );
  if (missingSemanticTools.length > 0) {
    debugLogger.warn(
      `Semantic tools missing (${missingSemanticTools.join(', ')}). ` +
        'Some browser interactions may not work correctly.',
    );
  }

  // Only click_at is strictly required — text input can use press_key or fill.
  const requiredVisualTools = ['click_at'];
  const missingVisualTools = requiredVisualTools.filter(
    (t) => !availableToolNames.includes(t),
  );

  // Check if visual agent model is available for current auth type.
  // The visual agent model (computer-use) is only available via Gemini API key
  // or Vertex AI, not via GCA/OAuth or Cloud Shell.
  const isVisualModelAvailable = (() => {
    const authType = config.getContentGeneratorConfig()?.authType;
    if (
      authType === AuthType.LOGIN_WITH_GOOGLE ||
      authType === AuthType.LEGACY_CLOUD_SHELL ||
      authType === AuthType.COMPUTE_ADC
    ) {
      return false;
    }
    return true;
  })();

  // Create all tools - visual delegation only if visual tools are available
  const allTools: AnyDeclarativeTool[] = [...mcpTools];

  if (missingVisualTools.length > 0) {
    debugLogger.log(
      `Visual tools missing (${missingVisualTools.join(', ')}). ` +
        `Visual agent delegation disabled. Ensure chrome-devtools-mcp is started with --experimental-vision.`,
    );
    if (printOutput) {
      printOutput(
        `⚠️ Visual tools unavailable - coordinate-based actions disabled.`,
      );
    }
  } else if (!isVisualModelAvailable) {
    debugLogger.log(
      `Visual agent model not available for current auth type. ` +
        `Visual agent delegation disabled.`,
    );
    if (printOutput) {
      printOutput(
        `⚠️ Visual agent unavailable for current auth type - coordinate-based actions disabled.`,
      );
    }
  } else {
    // Create visual analysis tool only if visual tools are available
    const visualDelegationTool = createAnalyzeScreenshotTool(
      browserManager,
      config,
      messageBus,
    );
    allTools.push(visualDelegationTool);
  }

  debugLogger.log(
    `Created ${allTools.length} tools for browser agent: ` +
      allTools.map((t) => t.name).join(', '),
  );

  // Create configured definition with tools
  // BrowserAgentDefinition is a factory function - call it with config
  const baseDefinition = BrowserAgentDefinition(config);
  const definition: LocalAgentDefinition<typeof BrowserTaskResultSchema> = {
    ...baseDefinition,
    toolConfig: {
      tools: allTools,
    },
  };

  return { definition, browserManager };
}

/**
 * Cleans up browser resources after agent execution.
 *
 * @param browserManager The browser manager to clean up
 */
export async function cleanupBrowserAgent(
  browserManager: BrowserManager,
): Promise<void> {
  try {
    await browserManager.close();
    debugLogger.log('Browser agent cleanup complete');
  } catch (error) {
    debugLogger.error(
      `Error during browser cleanup: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
