/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiClient } from '../../core/client.js';
import {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models.js';
import { createUserContent, GenerateContentConfig, Type } from '@google/genai';
import { DEFAULT_GEMINI_FLASH_LITE_MODEL } from '../../config/models.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';

const CLASSIFIER_GENERATION_CONFIG: GenerateContentConfig = {
  temperature: 0,
  maxOutputTokens: 200,
  thinkingConfig: {
    thinkingBudget: 0,
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
  "model_choice": "${PRO_MODEL}"
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

export class ClassifierStrategy implements RoutingStrategy {
  async route(
    context: RoutingContext,
    client: GeminiClient,
  ): Promise<RoutingDecision> {
    const startTime = Date.now();

    const historySlice = context.history.slice(-HISTORY_SEARCH_WINDOW);

    // The classifier only needs conversational text. Filter out tool-related turns.
    // TODO - Consider using function req/res if they help accuracy.
    const cleanHistory = historySlice.filter(
      (content) => !isFunctionCall(content) && !isFunctionResponse(content),
    );

    // Take the last N turns from the *cleaned* history.
    const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    const routerResponse = await client.generateJson(
      [...finalHistory, createUserContent(context.request)],
      RESPONSE_SCHEMA,
      context.signal,
      DEFAULT_GEMINI_FLASH_LITE_MODEL,
      {
        systemInstruction: { parts: [{ text: CLASSIFIER_SYSTEM_PROMPT }] },
        ...CLASSIFIER_GENERATION_CONFIG,
      },
    );

    const reasoning = routerResponse.reasoning as string;
    const latencyMs = Date.now() - startTime;

    if (routerResponse.model_choice === FLASH_MODEL) {
      console.log(
        `Model chosen: ${FLASH_MODEL},
Reasoning:
${reasoning}`,
      );
      // Currently, due to a model bug, using Flash as one of the first few requests causes empty token responses.
      // Due to this, we will temporarily avoid routing for the first 5 parts in the history.
      return {
        model:
          context.history.length < 5
            ? DEFAULT_GEMINI_FLASH_LITE_MODEL
            : DEFAULT_GEMINI_FLASH_MODEL,
        reason: `ClassifierStrategy: ${reasoning}`,
        metadata: {
          source: 'Classifier',
          latencyMs,
          reasoning,
        },
      };
    } else {
      console.log(
        `Model chosen: ${PRO_MODEL},
Reasoning:
${reasoning}`,
      );
      return {
        model: DEFAULT_GEMINI_MODEL,
        reason: `ClassifierStrategy: ${reasoning}`,
        metadata: {
          source: 'Classifier',
          latencyMs,
          reasoning,
        },
      };
    }
  }
}
