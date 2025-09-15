/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models.js';
import {
  type GenerateContentConfig,
  createUserContent,
  Type,
} from '@google/genai';
import type { Config } from '../../config/config.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';

const CLASSIFIER_GENERATION_CONFIG: GenerateContentConfig = {
  temperature: 0,
  maxOutputTokens: 1024,
  thinkingConfig: {
    thinkingBudget: 512, // This counts towards output max, so we don't want -1.
  },
};

// The number of recent history turns to provide to the router for context.
const HISTORY_TURNS_FOR_CONTEXT = 4;
const HISTORY_SEARCH_WINDOW = 20;

const FLASH_MODEL = 'flash';
const PRO_MODEL = 'pro';

const CLASSIFIER_SYSTEM_PROMPT = `
You are a specialized Task Routing AI. Your sole function is to analyze the user's request and classify its complexity. Choose between \`${FLASH_MODEL}\` (SIMPLE) or \`${PRO_MODEL}\` (COMPLEX).
1.  \`${FLASH_MODEL}\`: A fast, efficient model for simple, well-defined tasks.
2.  \`${PRO_MODEL}\`: A powerful, advanced model for complex, open-ended, or multi-step tasks.
<complexity_rubric>
A task is COMPLEX (Choose \`${PRO_MODEL}\`) if it meets ONE OR MORE of the following criteria:
1.  **High Operational Complexity (Est. 4+ Steps/Tool Calls):** Requires dependent actions, significant planning, or multiple coordinated changes.
2.  **Strategic Planning & Conceptual Design:** Asking "how" or "why." Requires advice, architecture, or high-level strategy.
3.  **High Ambiguity or Large Scope (Extensive Investigation):** Broadly defined requests requiring extensive investigation.
4.  **Deep Debugging & Root Cause Analysis:** Diagnosing unknown or complex problems from symptoms.
A task is SIMPLE (Choose \`${FLASH_MODEL}\`) if it is highly specific, bounded, and has Low Operational Complexity (Est. 1-3 tool calls). Operational simplicity overrides strategic phrasing.
</complexity_rubric>
**Output Format:**
Respond *only* in JSON format according to the following schema. Do not include any text outside the JSON structure.
{
  "type": "object",
  "properties": {
    "reasoning": {
      "type": "string",
      "description": "A brief, step-by-step explanation for the model choice, referencing the rubric."
    },
    "model_choice": {
      "type": "string",
      "enum": ["${FLASH_MODEL}", "${PRO_MODEL}"]
    }
  },
  "required": ["reasoning", "model_choice"]
}
--- EXAMPLES ---
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

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        'A brief, step-by-step explanation for the model choice, referencing the rubric.',
    },
    model_choice: {
      type: Type.STRING,
      enum: [FLASH_MODEL, PRO_MODEL],
    },
  },
  required: ['reasoning', 'model_choice'],
};

const ClassifierResponseSchema = z.object({
  reasoning: z.string(),
  model_choice: z.enum([FLASH_MODEL, PRO_MODEL]),
});

export class ClassifierStrategy implements RoutingStrategy {
  readonly name = 'classifier';

  async route(
    context: RoutingContext,
    _config: Config,
    baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const startTime = Date.now();
    try {
      let promptId = promptIdContext.getStore();
      if (!promptId) {
        promptId = `classifier-router-fallback-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;
        console.warn(
          `Could not find promptId in context. This is unexpected. Using a fallback ID: ${promptId}`,
        );
      }

      const historySlice = context.history.slice(-HISTORY_SEARCH_WINDOW);

      // Filter out tool-related turns.
      // TODO - Consider using function req/res if they help accuracy.
      const cleanHistory = historySlice.filter(
        (content) => !isFunctionCall(content) && !isFunctionResponse(content),
      );

      // Take the last N turns from the *cleaned* history.
      const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

      const jsonResponse = await baseLlmClient.generateJson({
        contents: [...finalHistory, createUserContent(context.request)],
        schema: RESPONSE_SCHEMA,
        model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        systemInstruction: CLASSIFIER_SYSTEM_PROMPT,
        config: CLASSIFIER_GENERATION_CONFIG,
        abortSignal: context.signal,
        promptId,
      });

      const routerResponse = ClassifierResponseSchema.parse(jsonResponse);

      const reasoning = routerResponse.reasoning;
      const latencyMs = Date.now() - startTime;

      if (routerResponse.model_choice === FLASH_MODEL) {
        return {
          model: DEFAULT_GEMINI_FLASH_MODEL,
          metadata: {
            source: 'Classifier',
            latencyMs,
            reasoning,
          },
        };
      } else {
        return {
          model: DEFAULT_GEMINI_MODEL,
          metadata: {
            source: 'Classifier',
            reasoning,
            latencyMs,
          },
        };
      }
    } catch (error) {
      // If the classifier fails for any reason (API error, parsing error, etc.),
      // we log it and return null to allow the composite strategy to proceed.
      console.warn(`[Routing] ClassifierStrategy failed:`, error);
      return null;
    }
  }
}
