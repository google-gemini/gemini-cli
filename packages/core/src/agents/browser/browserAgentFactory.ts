/**
 * @license
 * Copyright 2026 Google LLC
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
import { BROWSER_AGENT_NAME } from './browserAgentDefinition.js';
import { MCP_TOOL_PREFIX } from '../../tools/mcp-tool.js';
import {
  BrowserAgentDefinition,
  type BrowserTaskResultSchema,
} from './browserAgentDefinition.js';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import { createAnalyzeScreenshotTool } from './analyzeScreenshot.js';
import { injectAutomationOverlay } from './automationOverlay.js';
import { injectInputBlocker } from './inputBlocker.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { recordBrowserAgentToolDiscovery } from '../../telemetry/metrics.js';
import {
  logBrowserAgentVisionStatus,
  logBrowserAgentCleanup,
} from '../../telemetry/loggers.js';
import {
  PolicyDecision,
  PRIORITY_SUBAGENT_TOOL,
  type PolicyRule,
} from '../../policy/types.js';

/**
 * Structured return type for vision disabled reasons.
 * Separates the condition code from the human-readable message.
 */
type VisionDisabledReason =
  | { code: 'no_visual_model'; message: string }
  | { code: 'missing_visual_tools'; message: string }
  | { code: 'blocked_auth_type'; message: string }
  | undefined;

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
  _printOutput?: (msg: string) => void,
): Promise<{
  definition: LocalAgentDefinition<typeof BrowserTaskResultSchema>;
  browserManager: BrowserManager;
  visionEnabled: boolean;
  sessionMode: 'persistent' | 'isolated' | 'existing';
}> {
  debugLogger.log(
    'Creating browser agent definition with isolated MCP tools...',
  );

  // Get or create browser manager singleton for this session mode/profile
  const browserManager = BrowserManager.getInstance(config);
  browserManager.acquire();

  try {
    await browserManager.ensureConnection();

    debugLogger.log('Browser connected with isolated MCP client.');

    // Determine if input blocker should be active (non-headless + enabled)
    const shouldDisableInput = config.shouldDisableBrowserUserInput();
    // Inject automation overlay and input blocker if not in headless mode
    const browserConfig = config.getBrowserAgentConfig();
    if (!browserConfig?.customConfig?.headless) {
      debugLogger.log('Injecting automation overlay...');
      await injectAutomationOverlay(browserManager);
      if (shouldDisableInput) {
        debugLogger.log('Injecting input blocker...');
        await injectInputBlocker(browserManager);
      }
    }

    // Create declarative tools from dynamically discovered MCP tools
    // These tools dispatch to browserManager's isolated client
    const mcpTools = await createMcpDeclarativeTools(
      browserManager,
      messageBus,
      shouldDisableInput,
      browserConfig.customConfig.blockFileUploads,
    );
    const availableToolNames = mcpTools.map((t) => t.name);

    // Register high-priority policy rules for sensitive actions which is not
    // able to be overwrite by YOLO mode.
    const policyEngine = config.getPolicyEngine();

    if (policyEngine) {
      const existingRules = policyEngine.getRules();

      const restrictedTools = ['fill', 'fill_form'];

      // ASK_USER for upload_file and evaluate_script when sensitive action
      // need confirmation.
      if (browserConfig.customConfig.confirmSensitiveActions) {
        restrictedTools.push('upload_file', 'evaluate_script');
      }

      for (const toolName of restrictedTools) {
        const rule = generateAskUserRules(toolName);
        if (!existingRules.some((r) => isRuleEqual(r, rule))) {
          policyEngine.addRule(rule);
        }
      }

      // Reduce noise for read-only tools in default mode
      const readOnlyTools = (await browserManager.getDiscoveredTools())
        .filter((t) => !!t.annotations?.readOnlyHint)
        .map((t) => t.name);
      const allowlistedReadonlyTools = ['take_snapshot', 'take_screenshot'];

      for (const toolName of [...readOnlyTools, ...allowlistedReadonlyTools]) {
        if (availableToolNames.includes(toolName)) {
          const rule = generateAllowRules(toolName);
          if (!existingRules.some((r) => isRuleEqual(r, rule))) {
            policyEngine.addRule(rule);
          }
        }
      }
    }

    function generateAskUserRules(toolName: string): PolicyRule {
      return {
        toolName: `${MCP_TOOL_PREFIX}${BROWSER_AGENT_NAME}_${toolName}`,
        decision: PolicyDecision.ASK_USER,
        priority: 999,
        source: 'BrowserAgent (Sensitive Actions)',
        mcpName: BROWSER_AGENT_NAME,
      };
    }

    function generateAllowRules(toolName: string): PolicyRule {
      return {
        toolName: `${MCP_TOOL_PREFIX}${BROWSER_AGENT_NAME}_${toolName}`,
        decision: PolicyDecision.ALLOW,
        priority: PRIORITY_SUBAGENT_TOOL,
        source: 'BrowserAgent (Read-Only)',
        mcpName: BROWSER_AGENT_NAME,
      };
    }

    // Check if policy rule the same in all the attributes that we care about
    function isRuleEqual(rule1: PolicyRule, rule2: PolicyRule) {
      return (
        rule1.toolName === rule2.toolName &&
        rule1.decision === rule2.decision &&
        rule1.priority === rule2.priority &&
        rule1.mcpName === rule2.mcpName
      );
    }

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

    const rawSessionMode = browserConfig?.customConfig?.sessionMode;
    const sessionMode =
      rawSessionMode === 'isolated' || rawSessionMode === 'existing'
        ? rawSessionMode
        : 'persistent';

    recordBrowserAgentToolDiscovery(
      config,
      mcpTools.length,
      missingSemanticTools,
      sessionMode,
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

    // Check whether vision can be enabled; returns structured type with code and message.
    function getVisionDisabledReason(): VisionDisabledReason {
      const browserConfig = config.getBrowserAgentConfig();
      if (!browserConfig.customConfig.visualModel) {
        return {
          code: 'no_visual_model',
          message: 'No visualModel configured.',
        };
      }
      if (missingVisualTools.length > 0) {
        return {
          code: 'missing_visual_tools',
          message:
            `Visual tools missing (${missingVisualTools.join(', ')}). ` +
            `The installed chrome-devtools-mcp version may be too old.`,
        };
      }
      const authType = config.getContentGeneratorConfig()?.authType;
      const blockedAuthTypes = new Set([
        AuthType.LOGIN_WITH_GOOGLE,
        AuthType.LEGACY_CLOUD_SHELL,
        AuthType.COMPUTE_ADC,
      ]);
      if (authType && blockedAuthTypes.has(authType)) {
        return {
          code: 'blocked_auth_type',
          message: 'Visual agent model not available for current auth type.',
        };
      }
      return undefined;
    }

    const allTools: AnyDeclarativeTool[] = [...mcpTools];
    const visionDisabledReason = getVisionDisabledReason();

    logBrowserAgentVisionStatus(config, {
      enabled: !visionDisabledReason,
      disabled_reason: visionDisabledReason?.code,
    });

    if (visionDisabledReason) {
      debugLogger.log(`Vision disabled: ${visionDisabledReason.message}`);
    } else {
      allTools.push(
        createAnalyzeScreenshotTool(browserManager, config, messageBus),
      );
    }

    debugLogger.log(
      `Created ${allTools.length} tools for browser agent: ` +
        allTools.map((t) => t.name).join(', '),
    );

    // Create configured definition with tools
    // BrowserAgentDefinition is a factory function - call it with config
    const baseDefinition = BrowserAgentDefinition(
      config,
      !visionDisabledReason,
    );
    const definition: LocalAgentDefinition<typeof BrowserTaskResultSchema> = {
      ...baseDefinition,
      toolConfig: {
        tools: allTools,
      },
    };

    return {
      definition,
      browserManager,
      visionEnabled: !visionDisabledReason,
      sessionMode,
    };
  } catch (error) {
    // Release the browser manager if setup fails, so concurrent tasks can try again.
    browserManager.release();
    throw error;
  }
}

/**
 * Closes all persistent browser sessions and cleans up resources.
 *
 * @param browserManager The browser manager to clean up
 * @param config Runtime configuration
 * @param sessionMode The browser session mode
 */
export async function cleanupBrowserAgent(
  browserManager: BrowserManager,
  config: Config,
  sessionMode: 'persistent' | 'isolated' | 'existing',
): Promise<void> {
  const startMs = Date.now();
  try {
    await browserManager.close();
    logBrowserAgentCleanup(config, Date.now() - startMs, {
      session_mode: sessionMode,
      success: true,
    });
    debugLogger.log('Browser agent cleanup complete');
  } catch (error) {
    logBrowserAgentCleanup(config, Date.now() - startMs, {
      session_mode: sessionMode,
      success: false,
    });
    debugLogger.error(
      `Error during browser cleanup: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Call this on /clear commands and CLI exit to reset browser state.
 */
export async function resetBrowserSession(): Promise<void> {
  await BrowserManager.resetAll();
}
