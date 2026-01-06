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
import { resolveClassifierModel } from '../../config/models.js';
import { createUserContent, Type } from '@google/genai';
import type { Config } from '../../config/config.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';
import { debugLogger } from '../../utils/debugLogger.js';

// The number of recent history turns to provide to the router for context.
const HISTORY_TURNS_FOR_CONTEXT = 4;
const HISTORY_SEARCH_WINDOW = 20;

const FLASH_MODEL = 'flash';
const PRO_MODEL = 'pro';

const CLASSIFIER_SYSTEM_PROMPT = `
You are a specialized Task Routing AI. Your sole function is to analyze the user's request and assign a **Complexity Score** from 1 to 100.
<complexity_rubric>
**1-20: Trivial / Direct (Low Risk)**
*   Simple, read-only commands (e.g., "read file", "list dir").
*   Exact, explicit instructions with zero ambiguity.
*   Single-step operations.

**21-50: Standard / Routine (Moderate Risk)**
*   Single-file edits or simple refactors.
*   "Fix this error" where the error is clear and local.
*   Standard boilerplate generation.
*   Multi-step but linear tasks (e.g., "create file, then edit it").

**51-80: High Complexity / Analytical (High Risk)**
*   Multi-file dependencies (changing X requires updating Y and Z).
*   "Why is this broken?" (Debugging unknown causes).
*   Feature implementation requiring understanding of broader context.
*   Refactoring complex logic.

**81-100: Extreme / Strategic (Critical Risk)**
*   "Architect a new system" or "Migrate database".
*   Highly ambiguous requests ("Make this better").
*   Tasks requiring deep reasoning, safety checks, or novel invention.
*   Massive scale changes (10+ files).
</complexity_rubric>

**Output Format:**
Respond *only* in JSON format according to the following schema.
{
  "type": "object",
  "properties": {
    "reasoning": {
      "type": "string",
      "description": "Brief explanation for the score."
    },
    "complexity_score": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": ["reasoning", "complexity_score"]
}
--- EXAMPLES ---
*Prompt:* "read package.json"
*JSON:* {"reasoning": "Simple read operation.", "complexity_score": 10}

*Prompt:* "Rename the 'data' variable to 'userData' in utils.ts"
*JSON:* {"reasoning": "Single file, specific edit.", "complexity_score": 30}

*Prompt:* "I'm getting a null pointer in the auth service. Debug it."
*JSON:* {"reasoning": "Requires investigation and debugging unknown cause.", "complexity_score": 65}

*Prompt:* "Design a microservices backend for this app."
*JSON:* {"reasoning": "High-level architecture and strategic planning.", "complexity_score": 95}
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description: 'Brief explanation for the score.',
    },
    complexity_score: {
      type: Type.INTEGER,
      description: 'Complexity score from 1-100.',
    },
  },
  required: ['reasoning', 'complexity_score'],
};

const ClassifierResponseSchema = z.object({
  reasoning: z.string(),
  complexity_score: z.number().min(1).max(100),
});

export class ClassifierStrategy implements RoutingStrategy {
  readonly name = 'classifier';

  async route(
    context: RoutingContext,
    config: Config,
    baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const startTime = Date.now();
    try {
      let promptId = promptIdContext.getStore();
      if (!promptId) {
        promptId = `classifier-router-fallback-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;
        debugLogger.warn(
          `Could not find promptId in context. This is unexpected. Using a fallback ID: ${promptId}`,
        );
      }

      const historySlice = context.history.slice(-HISTORY_SEARCH_WINDOW);
      const cleanHistory = historySlice.filter(
        (content) => !isFunctionCall(content) && !isFunctionResponse(content),
      );
      const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

      const jsonResponse = await baseLlmClient.generateJson({
        modelConfigKey: { model: 'classifier' },
        contents: [...finalHistory, createUserContent(context.request)],
        schema: RESPONSE_SCHEMA,
        systemInstruction: CLASSIFIER_SYSTEM_PROMPT,
        abortSignal: context.signal,
        promptId,
      });

      const routerResponse = ClassifierResponseSchema.parse(jsonResponse);
      const score = routerResponse.complexity_score;

      // A/B Test Thresholds
      // Control (Conservative): 50 (Everything above "Standard" goes to Pro)
      // Strict (Aggressive): 80 (Only "Extreme" goes to Pro)
      const isStrict = Math.random() < 0.5;
      const threshold = isStrict ? 80 : 50;
      const groupLabel = isStrict ? 'Strict' : 'Control';

      // Select Model based on Score vs Threshold
      const modelAlias = score >= threshold ? PRO_MODEL : FLASH_MODEL;

      const selectedModel = resolveClassifierModel(
        config.getModel(),
        modelAlias,
        config.getPreviewFeatures(),
      );

      const latencyMs = Date.now() - startTime;

      return {
        model: selectedModel,
        metadata: {
          source: `Classifier (${groupLabel})`,
          latencyMs,
          reasoning: `[Score: ${score} / Threshold: ${threshold}] ${routerResponse.reasoning}`,
        },
      };
    } catch (error) {
      debugLogger.warn(`[Routing] ClassifierStrategy failed:`, error);
      return null;
    }
  }
}
