/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tool for visual identification via a single model call.
 *
 * The semantic browser agent uses this tool when it needs to identify
 * elements by visual attributes not present in the accessibility tree
 * (e.g., color, layout, precise coordinates).
 *
 * Unlike the semantic agent which works with the accessibility tree,
 * this tool sends a screenshot to a computer-use model for visual analysis.
 * It returns the model's analysis (coordinates, element descriptions) back
 * to the browser agent, which retains full control of subsequent actions.
 */

import {
  DeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolInvocation,
} from '../../tools/tools.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { BrowserManager } from './browserManager.js';
import type { Config } from '../../config/config.js';
import { getVisualAgentModel } from './modelAvailability.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { LlmRole } from '../../telemetry/llmRole.js';

/**
 * System prompt for the visual analysis model call.
 */
const VISUAL_SYSTEM_PROMPT = `You are a Visual Analysis Agent. You receive a screenshot of a browser page and an instruction.

Your job is to ANALYZE the screenshot and provide precise information that a browser automation agent can act on.

COORDINATE SYSTEM:
- Coordinates are pixel-based relative to the viewport
- (0,0) is top-left of the visible area
- Estimate element positions from the screenshot

RESPONSE FORMAT:
- For coordinate identification: provide exact (x, y) pixel coordinates
- For element identification: describe the element's visual location and appearance
- For layout analysis: describe the spatial relationships between elements
- Be concise and actionable — the browser agent will use your response to decide what action to take

IMPORTANT:
- You are NOT performing actions — you are only providing visual analysis
- Include coordinates when possible so the caller can use click_at(x, y)
- If the element is not visible in the screenshot, say so explicitly`;

/**
 * Invocation for the analyze_screenshot tool.
 * Makes a single generateContent call with a screenshot.
 */
class AnalyzeScreenshotInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly config: Config,
    params: Record<string, unknown>,
    messageBus: MessageBus,
  ) {
    super(params, messageBus, 'analyze_screenshot', 'Analyze Screenshot');
  }

  getDescription(): string {
    const instruction = String(this.params['instruction'] ?? '');
    const preview =
      instruction.length > 50
        ? instruction.substring(0, 50) + '...'
        : instruction;
    return `Visual analysis: "${preview}"`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const instruction = String(this.params['instruction'] ?? '');

      debugLogger.log(`Visual analysis requested: ${instruction}`);

      // Capture screenshot via MCP tool
      const screenshotResult = await this.browserManager.callTool(
        'take_screenshot',
        {},
      );

      // Extract base64 image data from MCP response.
      // Search ALL content items for image type — MCP returns [text, image]
      // where content[0] is a text description and content[1] is the actual PNG.
      let screenshotBase64 = '';
      let mimeType = 'image/png';
      if (screenshotResult.content && Array.isArray(screenshotResult.content)) {
        for (const item of screenshotResult.content) {
          if (item.type === 'image' && item.data) {
            screenshotBase64 = item.data;
            mimeType = item.mimeType ?? 'image/png';
            break;
          }
        }
      }

      if (!screenshotBase64) {
        return {
          llmContent:
            'Failed to capture screenshot for visual analysis. Use accessibility tree elements instead.',
          returnDisplay: 'Screenshot capture failed',
          error: { message: 'Screenshot capture failed' },
        };
      }

      // Make a single generateContent call with the visual model
      const visualModel = getVisualAgentModel(this.config);
      const contentGenerator = this.config.getContentGenerator();

      const response = await contentGenerator.generateContent(
        {
          model: visualModel,
          config: {
            temperature: 0,
            topP: 0.95,
            systemInstruction: VISUAL_SYSTEM_PROMPT,
            abortSignal: signal,
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Analyze this screenshot and respond to the following instruction:\n\n${instruction}`,
                },
                {
                  inlineData: {
                    mimeType,
                    data: screenshotBase64,
                  },
                },
              ],
            },
          ],
        },
        'visual-analysis',
        LlmRole.UTILITY_TOOL,
      );

      // Extract text from response
      const responseText =
        response.candidates?.[0]?.content?.parts
          ?.filter((p) => p.text)
          .map((p) => p.text)
          .join('\n') ?? '';

      if (!responseText) {
        return {
          llmContent:
            'Visual model returned no analysis. Use accessibility tree elements instead.',
          returnDisplay: 'Visual analysis returned empty response',
          error: { message: 'Empty visual analysis response' },
        };
      }

      debugLogger.log(
        `Visual analysis complete: ${responseText.slice(0, 100)}`,
      );

      return {
        llmContent: `Visual Analysis Result:\n${responseText}`,
        returnDisplay: `Visual Analysis Result:\n${responseText}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`Visual analysis failed: ${errorMsg}`);

      // Provide a graceful fallback message for model unavailability
      const isModelError =
        errorMsg.includes('404') ||
        errorMsg.includes('403') ||
        errorMsg.includes('not found') ||
        errorMsg.includes('permission');

      const fallbackMsg = isModelError
        ? 'Visual analysis model is not available. Use accessibility tree elements (uids from take_snapshot) for all interactions instead.'
        : `Visual analysis failed: ${errorMsg}. Use accessibility tree elements instead.`;

      return {
        llmContent: fallbackMsg,
        returnDisplay: fallbackMsg,
        error: { message: errorMsg },
      };
    }
  }
}

/**
 * DeclarativeTool for screenshot-based visual analysis.
 */
class AnalyzeScreenshotTool extends DeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      'analyze_screenshot',
      'analyze_screenshot',
      'Analyze the current page visually using a screenshot. Use when you need to identify elements by visual attributes (color, layout, position) not available in the accessibility tree, or when you need precise pixel coordinates for click_at. Returns visual analysis — you perform the actions yourself.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description:
              'What to identify or analyze visually (e.g., "Find the coordinates of the blue submit button", "What is the layout of the navigation menu?").',
          },
        },
        required: ['instruction'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  build(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new AnalyzeScreenshotInvocation(
      this.browserManager,
      this.config,
      params,
      this.messageBus,
    );
  }
}

/**
 * Creates the analyze_screenshot tool for the browser agent.
 */
export function createAnalyzeScreenshotTool(
  browserManager: BrowserManager,
  config: Config,
  messageBus: MessageBus,
): AnalyzeScreenshotTool {
  return new AnalyzeScreenshotTool(browserManager, config, messageBus);
}
