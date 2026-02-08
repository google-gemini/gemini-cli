/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';
import { resolveClassifierModel } from '../../config/models.js';
import { createUserContent, type Content, type Part } from '@google/genai';
import type { Config } from '../../config/config.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { LocalLiteRtLmClient } from '../../core/localLiteRtLmClient.js';

// The number of recent history turns to provide to the router for context.
const HISTORY_TURNS_FOR_CONTEXT = 4;
const HISTORY_SEARCH_WINDOW = 20;

const FLASH_MODEL = 'flash';
const PRO_MODEL = 'pro';

const COMPLEXITY_RUBRIC = `### Complexity Rubric
A task is COMPLEX (Choose \`${PRO_MODEL}\`) if it meets ONE OR MORE of the following criteria:
1.  **High Operational Complexity (Est. 4+ Steps/Tool Calls):** Requires dependent actions, significant planning, or multiple coordinated changes.
2.  **Strategic Planning & Conceptual Design:** Asking "how" or "why." Requires advice, architecture, or high-level strategy.
3.  **High Ambiguity or Large Scope (Extensive Investigation):** Broadly defined requests requiring extensive investigation.
4.  **Deep Debugging & Root Cause Analysis:** Diagnosing unknown or complex problems from symptoms.
A task is SIMPLE (Choose \`${FLASH_MODEL}\`) if it is highly specific, bounded, and has Low Operational Complexity (Est. 1-3 tool calls). Operational simplicity overrides strategic phrasing.`;

const OUTPUT_FORMAT = `### Output Format
Respond *only* in JSON format like this:
{
  "reasoning": Your reasoning...
  "model_choice": Either ${FLASH_MODEL} or ${PRO_MODEL}
}
And you must follow the following JSON schema:
{
  "type": "object",
  "properties": {
    "reasoning": {
      "type": "string",
      "description": "A brief summary of the user objective, followed by a step-by-step explanation for the model choice, referencing the rubric."
    },
    "model_choice": {
      "type": "string",
      "enum": ["${FLASH_MODEL}", "${PRO_MODEL}"]
    }
  },
  "required": ["reasoning", "model_choice"]
}
You must ensure that your reasoning is no more than 2 sentences long and directly references the rubric criteria.
When making your decision, the user's request should be weighted much more heavily than the surrounding context when making your determination.`;

const LITERT_GEMMA_CLASSIFIER_SYSTEM_PROMPT = `### Role
You are the **Lead Orchestrator** for an AI system. You do not talk to users. Your sole responsibility is to analyze the **Chat History** and delegate the **Current Request** to the most appropriate **Model** based on the request's complexity.

### Models
Choose between \`${FLASH_MODEL}\` (SIMPLE) or \`${PRO_MODEL}\` (COMPLEX).
1.  \`${FLASH_MODEL}\`: A fast, efficient model for simple, well-defined tasks.
2.  \`${PRO_MODEL}\`: A powerful, advanced model for complex, open-ended, or multi-step tasks.

${COMPLEXITY_RUBRIC}

${OUTPUT_FORMAT}

### Examples
**Example 1 (Strategic Planning):**
*User Prompt:* "How should I architect the data pipeline for this new analytics service?"
*Your JSON Output:*
{
  "reasoning": "The user is asking for high-level architectural design and strategy. This falls under 'Strategic Planning & Conceptual Design'.",
  "model_choice": "${PRO_MODEL}"
}
**Example 2 (Simple Tool Use):**
*User Prompt:* "list the files in the current directory"
*Your JSON Output:*
{
  "reasoning": "This is a direct command requiring a single tool call (ls). It has Low Operational Complexity (1 step).",
  "model_choice": "${FLASH_MODEL}"
}
**Example 3 (High Operational Complexity):**
*User Prompt:* "I need to add a new 'email' field to the User schema in 'src/models/user.ts', migrate the database, and update the registration endpoint."
*Your JSON Output:*
{
  "reasoning": "This request involves multiple coordinated steps across different files and systems. This meets the criteria for High Operational Complexity (4+ steps).",
  "model_choice": "${PRO_MODEL}"
}
**Example 4 (Simple Read):**
*User Prompt:* "Read the contents of 'package.json'."
*Your JSON Output:*
{
  "reasoning": "This is a direct command requiring a single read. It has Low Operational Complexity (1 step).",
  "model_choice": "${FLASH_MODEL}"
}
**Example 5 (Deep Debugging):**
*User Prompt:* "I'm getting an error 'Cannot read property 'map' of undefined' when I click the save button. Can you fix it?"
*Your JSON Output:*
{
  "reasoning": "The user is reporting an error symptom without a known cause. This requires investigation and falls under 'Deep Debugging'.",
  "model_choice": "${PRO_MODEL}"
}
**Example 6 (Simple Edit despite Phrasing):**
*User Prompt:* "What is the best way to rename the variable 'data' to 'userData' in 'src/utils.js'?"
*Your JSON Output:*
{
  "reasoning": "Although the user uses strategic language ('best way'), the underlying task is a localized edit. The operational complexity is low (1-2 steps).",
  "model_choice": "${FLASH_MODEL}"
}
`;

const LITERT_GEMMA_CLASSIFIER_REMINDER = `### Reminder
You are a Task Routing AI. Your sole task is to analyze the preceding **Chat History** and **Current Request** and classify its complexity.

${COMPLEXITY_RUBRIC}

${OUTPUT_FORMAT}
`;

const ClassifierResponseSchema = z.object({
  reasoning: z.string(),
  model_choice: z.enum([FLASH_MODEL, PRO_MODEL]),
});

export class GemmaClassifierStrategy implements RoutingStrategy {
  readonly name = 'gemma-classifier';

  private flattenChatHistory(turns: Content[]): Content[] {
    const formattedHistory = turns
      .slice(0, -1)
      .map((turn) =>
        turn.parts ? turn.parts.map((part) => part.text).join('\n') : '',
      )
      .join('\n\n');

    const lastTurn = turns.at(-1);
    const userRequest =
      lastTurn?.parts?.map((part: Part) => part.text).join('\n\n') ?? '';

    const finalPrompt = `You are provided with a **Chat History** and the user's **Current Request** below.

#### Chat History:
${formattedHistory}

#### Current Request:
"${userRequest}"
`;
    return [createUserContent(finalPrompt)];
  }

  async route(
    context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
    client: LocalLiteRtLmClient,
  ): Promise<RoutingDecision | null> {
    const startTime = Date.now();
    const gemmaRouterSettings = config.getGemmaModelRouterSettings();
    if (!gemmaRouterSettings?.enabled) {
      return null;
    }
    try {
      const historySlice = context.history.slice(-HISTORY_SEARCH_WINDOW);

      // Filter out tool-related turns.
      // TODO - Consider using function req/res if they help accuracy.
      const cleanHistory = historySlice.filter(
        (content) => !isFunctionCall(content) && !isFunctionResponse(content),
      );

      // Take the last N turns from the *cleaned* history.
      const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

      const history = [...finalHistory, createUserContent(context.request)];
      const singleMessageHistory = this.flattenChatHistory(history);

      const jsonResponse = await client.generateJson(
        singleMessageHistory,
        LITERT_GEMMA_CLASSIFIER_SYSTEM_PROMPT,
        LITERT_GEMMA_CLASSIFIER_REMINDER,
      );

      const routerResponse = ClassifierResponseSchema.parse(jsonResponse);

      const reasoning = routerResponse.reasoning;
      const latencyMs = Date.now() - startTime;
      const selectedModel = resolveClassifierModel(
        context.requestedModel ?? config.getModel(),
        routerResponse.model_choice,
      );

      return {
        model: selectedModel,
        metadata: {
          source: 'GemmaClassifier',
          latencyMs,
          reasoning,
        },
      };
    } catch (error) {
      // If the classifier fails for any reason (API error, parsing error, etc.),
      // we log it and return null to allow the composite strategy to proceed.
      debugLogger.warn(`[Routing] GemmaClassifierStrategy failed:`, error);
      return null;
    }
  }
}
