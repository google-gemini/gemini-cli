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
import { getErrorMessage } from '../../utils/errors.js';
import { createUserContent, GenerateContentConfig, Type } from '@google/genai';
import { DEFAULT_GEMINI_FLASH_LITE_MODEL } from '../../config/models.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';

const CLASSIFIER_GENERATION_CONFIG: GenerateContentConfig = {
  temperature: 0,
  maxOutputTokens: 200,
};

// The number of recent history turns to provide to the router for context.
const HISTORY_TURNS_FOR_CONTEXT = 4;
const HISTORY_SEARCH_WINDOW = 20;

const FLASH_MODEL = 'flash';
const PRO_MODEL = 'pro';

const CLASSIFIER_SYSTEM_PROMPT = `
You are a specialized Task Routing AI for a software engineering assistant. Your sole function is to analyze a user's prompt and classify its complexity. You will choose between two models:

1.  \`${FLASH_MODEL}\`: A fast, efficient model for simple, well-defined tasks.
2.  \`${PRO_MODEL}\`: A powerful, advanced model for complex, open-ended, or multi-step tasks.

**Classification Rubric:**

* **Choose \`${FLASH_MODEL}\` if the prompt involves:**
    * **Simple Questions:** Asking for syntax, definitions, or simple API usage (e.g., "what is the javascript syntax for a for loop?").
    * **Boilerplate Generation:** Creating standard code snippets or files (e.g., "generate a python flask hello world app").
    * **Single, Simple Tool Use:** A direct command that doesn't require context (e.g., "list the files in the current directory").
    * **Self-Contained Operations:** All information needed to complete the task is in the prompt itself.

* **Choose \`${PRO_MODEL}\` if the prompt involves:**
    * **Complex Reasoning or Planning:** Requires thinking through multiple steps or dependencies (e.g., "plan the migration path for a legacy api").
    * **Debugging:** Analyzing code with errors, especially when the context is large or the bug is non-obvious (e.g., "why am I getting a null pointer exception in this code block?").
    * **Architectural Design:** Open-ended requests about system structure or best practices (e.g., "design a scalable microservices architecture for an e-commerce site").
    * **Multi-File Context:** Requires reading, understanding, or modifying multiple files to fulfill the request (e.g., "refactor the User class and update all its usages across the codebase").
    * **Ambiguity or Broad Scope:** The user's intent is unclear or requires significant clarification (e.g., "improve my project's performance").

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

**Example 1 (Simple Case):**
*User Prompt:* "what is the syntax for an if statement in python?"
*Your JSON Output:*
{
  "reasoning": "The user is asking a simple, self-contained syntax question. This directly matches the 'Simple Questions' criteria for the flash model.",
  "model_choice": "${FLASH_MODEL}"
}

**Example 2 (Complex Case):**
*User Prompt:* "Refactor this component to use the new service layer and make sure all the tests pass."
*Your JSON Output:*
{
  "reasoning": "The request requires multi-file context (component, service layer, tests) and involves a complex, multi-step process (refactor and test). This aligns with the 'pro' criteria.",
  "model_choice": "${PRO_MODEL}"
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
    const historySlice = context.history.slice(-HISTORY_SEARCH_WINDOW);

    // The classifier only needs conversational text. Filter out tool-related turns.
    const cleanHistory = historySlice.filter((content) => {
      return !isFunctionCall(content) && !isFunctionResponse(content);
    });

    // Take the last N turns from the *cleaned* history.
    const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    try {
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

      if (routerResponse.model_choice === FLASH_MODEL) {
        // Currently, due to a model bug, using Flash as one of the first few requests causes empty token responses.
        // Due to this, we will temporarily avoid routing for the first 5 parts in the history.
        return {
          model:
            context.history.length < 5
              ? DEFAULT_GEMINI_FLASH_LITE_MODEL
              : DEFAULT_GEMINI_FLASH_MODEL,
          reason: `ClassifierStrategy: ${routerResponse.reasoning}`,
        };
      } else {
        return {
          model: DEFAULT_GEMINI_MODEL,
          reason: `ClassifierStrategy: ${routerResponse.reasoning}`,
        };
      }
    } catch (error) {
      console.log(
        `ClassifierStrategy failed: ${getErrorMessage(
          error,
        )}. Defaulting to flash model.`,
      );
      return {
        model: DEFAULT_GEMINI_FLASH_MODEL,
        reason:
          'ClassifierStrategy: Failed to classify, defaulting to flash model.',
      };
    }
  }
}
