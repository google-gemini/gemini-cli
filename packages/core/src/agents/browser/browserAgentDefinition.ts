/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Browser Agent definition following the LocalAgentDefinition pattern.
 *
 * This agent uses LocalAgentExecutor for its reAct loop, like CodebaseInvestigatorAgent.
 * It is available ONLY via delegate_to_agent, NOT as a direct tool.
 *
 * Tools are configured dynamically at invocation time via browserAgentFactory.
 */

import type { LocalAgentDefinition } from '../types.js';
import type { Config } from '../../config/config.js';
import { z } from 'zod';
import {
  isPreviewModel,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../../config/models.js';

/** Canonical agent name — used for routing and configuration lookup. */
export const BROWSER_AGENT_NAME = 'browser_agent';

/**
 * Output schema for browser agent results.
 */
export const BrowserTaskResultSchema = z.object({
  success: z.boolean().describe('Whether the task was completed successfully'),
  summary: z
    .string()
    .describe('A summary of what was accomplished or what went wrong'),
  data: z
    .unknown()
    .optional()
    .describe('Optional extracted data from the task'),
});

/**
 * System prompt for the semantic browser agent.
 * Extracted from prototype (computer_use_subagent_cdt branch).
 */
export const BROWSER_SYSTEM_PROMPT = `You are an expert browser automation agent (Orchestrator). Your goal is to completely fulfill the user's request.

IMPORTANT: You will receive an accessibility tree snapshot showing elements with uid values (e.g., uid=87_4 button "Login"). 
Use these uid values directly with your tools:
- click(uid="87_4") to click the Login button
- fill(uid="87_2", value="john") to fill a text field
- fill_form(elements=[{uid: "87_2", value: "john"}, {uid: "87_3", value: "pass"}]) to fill multiple fields at once

PARALLEL TOOL CALLS - CRITICAL:
- Do NOT make parallel calls for actions that change page state (click, fill, press_key, etc.)
- Each action changes the DOM and invalidates UIDs from the current snapshot
- Make state-changing actions ONE AT A TIME, then observe the results
- For typing text, prefer type_text tool instead of multiple press_key calls

OVERLAY/POPUP HANDLING:
Before interacting with page content, scan the accessibility tree for blocking overlays:
- Tooltips, popups, modals, cookie banners, newsletter prompts, promo dialogs
- These often have: close buttons (×, X, Close, Dismiss), "Got it", "Accept", "No thanks" buttons
- Common patterns: elements with role="dialog", role="tooltip", role="alertdialog", or aria-modal="true"
- If you see such elements, DISMISS THEM FIRST by clicking close/dismiss buttons before proceeding
- If a click seems to have no effect, check if an overlay appeared or is blocking the target

VISUAL IDENTIFICATION (analyze_screenshot):
When you need to identify elements by visual attributes not in the AX tree (e.g., "click the yellow button", "find the red error message"), or need precise pixel coordinates:
1. Call analyze_screenshot with a clear instruction describing what to find
2. It returns visual analysis with coordinates/descriptions — it does NOT perform actions
3. Use the returned coordinates with click_at(x, y) or other tools yourself
4. If the analysis is insufficient, call it again with a more specific instruction

CRITICAL: When you have fully completed the user's task, you MUST call the complete_task tool with a summary of what you accomplished. Do NOT just return text - you must explicitly call complete_task to exit the loop.`;

/**
 * Browser Agent Definition Factory.
 *
 * Following the CodebaseInvestigatorAgent pattern:
 * - Returns a factory function that takes Config for dynamic model selection
 * - kind: 'local' for LocalAgentExecutor
 * - toolConfig is set dynamically by browserAgentFactory
 */
export const BrowserAgentDefinition = (
  config: Config,
): LocalAgentDefinition<typeof BrowserTaskResultSchema> => {
  // Use Preview Flash model if the main model is any of the preview models.
  // If the main model is not a preview model, use the default flash model.
  const model = isPreviewModel(config.getModel())
    ? PREVIEW_GEMINI_FLASH_MODEL
    : DEFAULT_GEMINI_FLASH_MODEL;

  return {
    name: BROWSER_AGENT_NAME,
    kind: 'local',
    experimental: true,
    displayName: 'Browser Agent',
    description: `Specialized agent for web browser automation using the Accessibility Tree.
    Use this agent for: navigating websites, filling forms, clicking buttons,
    extracting information from web pages. It can see and interact with the page
    structure semantically through the accessibility tree.`,

    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task to perform in the browser.',
          },
        },
        required: ['task'],
      },
    },

    outputConfig: {
      outputName: 'result',
      description: 'The result of the browser task.',
      schema: BrowserTaskResultSchema,
    },

    processOutput: (output) => JSON.stringify(output, null, 2),

    modelConfig: {
      // Dynamic model based on whether user is using preview models
      model,
      generateContentConfig: {
        temperature: 0.1,
        topP: 0.95,
      },
    },

    runConfig: {
      maxTimeMinutes: 10,
      maxTurns: 50,
    },

    // Tools are set dynamically by browserAgentFactory after MCP connection
    // This is undefined here and will be set at invocation time
    toolConfig: undefined,

    promptConfig: {
      query: `Your task is:
<task>
\${task}
</task>

First, use new_page to open the relevant URL. Then call take_snapshot to see the page and proceed with your task.`,
      systemPrompt: BROWSER_SYSTEM_PROMPT,
    },
  };
};
