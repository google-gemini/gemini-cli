/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from './types.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';

const DeepWorkReadinessSchema = z.object({
  verdict: z.enum(['ready', 'needs_answers', 'reject']),
  missingRequiredQuestionIds: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  blockingReasons: z.array(z.string()),
  singleShotRecommendation: z.boolean(),
  recommendationText: z.string().optional(),
});

/**
 * Evaluates whether a task should run in Deep Work mode.
 */
export const DeepWorkReadinessAgent = (
  _config: Config,
): LocalAgentDefinition<typeof DeepWorkReadinessSchema> => ({
  kind: 'local',
  name: 'deep_work_readiness',
  displayName: 'Deep Work Readiness Agent',
  description:
    'Evaluates whether a task is suitable for Deep Work iteration and returns required follow-up questions when context is missing.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The Deep Work prompt to evaluate.',
        },
        max_runs: {
          type: 'number',
          description: 'Configured Deep Work max iteration count.',
        },
        max_time_minutes: {
          type: 'number',
          description: 'Configured Deep Work max runtime in minutes.',
        },
        completion_promise: {
          type: ['string', 'null'],
          description: 'Optional completion token configured for the run.',
        },
        approved_plan_path: {
          type: ['string', 'null'],
          description:
            'Optional approved plan path from Plan Mode to preserve execution context.',
        },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              question: { type: 'string' },
              required: { type: 'boolean' },
              answer: { type: 'string' },
              done: { type: 'boolean' },
            },
            required: ['id', 'question', 'required', 'answer', 'done'],
          },
          description: 'Required and optional readiness questions and answers.',
        },
      },
      required: ['prompt', 'max_runs', 'max_time_minutes', 'questions'],
    },
  },
  outputConfig: {
    outputName: 'readiness',
    description: 'Deep Work readiness report.',
    schema: DeepWorkReadinessSchema,
  },
  processOutput: (output) => JSON.stringify(output, null, 2),
  modelConfig: {
    model: GEMINI_MODEL_ALIAS_FLASH,
    generateContentConfig: {
      temperature: 0,
      topP: 0.9,
      thinkingConfig: {
        includeThoughts: false,
      },
    },
  },
  runConfig: {
    maxTimeMinutes: 2,
    maxTurns: 6,
  },
  toolConfig: {
    tools: [],
  },
  promptConfig: {
    query: `Assess this Deep Work run:\n\n<prompt>\n\${prompt}\n</prompt>\n\n<approved_plan_path>\n\${approved_plan_path}\n</approved_plan_path>\n\n<max_runs>\${max_runs}</max_runs>\n<max_time_minutes>\${max_time_minutes}</max_time_minutes>\n<completion_promise>\${completion_promise}</completion_promise>\n\n<questions>\n\${questions}\n</questions>`,
    systemPrompt: `You are a Deep Work readiness evaluator. Return a strict JSON object that matches the required schema.

Decision rubric:
1. Return "reject" when the prompt is clearly single-shot or trivial, or when Deep Work iteration would be unnecessary overhead.
2. Return "needs_answers" when required question answers are missing, prompt scope is ambiguous, or success criteria are unclear.
3. Return "ready" only when the task is clearly iterative and sufficiently specified for multi-run execution.

Use these suitability constraints:
- Good fit: multi-step implementation/refactor/migration tasks, iterative refinement, tasks with verification loops.
- Not a fit: one-shot operations, tasks mainly requiring human product/design decisions, unclear outcomes.

Plan continuity requirement:
- If approved_plan_path is non-empty, preserve that context by avoiding recommendations that discard planning context.
- If prompt appears to conflict with the approved plan context, include a blocking reason requesting clarification.

Output requirements:
- missingRequiredQuestionIds: include ids for required questions missing answers.
- followUpQuestions: concrete questions the user should answer next.
- blockingReasons: clear short reasons for reject/needs_answers decisions.
- singleShotRecommendation: true only when the task should not use Deep Work.
- recommendationText: include only when verdict is "reject".

Do not output markdown. Call complete_task with a valid JSON object.`,
  },
});
