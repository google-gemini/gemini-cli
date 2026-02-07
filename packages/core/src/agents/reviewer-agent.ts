/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { type LocalAgentDefinition, ReviewScoreSchema } from './types.js';

/**
 * An agent specialized in reviewing code changes for quality, bugs, and compliance.
 */
export const ReviewerAgent = (
  config: Config,
): LocalAgentDefinition<typeof ReviewScoreSchema> => ({
  kind: 'local',
  name: 'reviewer',
  displayName: 'Reviewer Agent',
  description:
    'An expert code reviewer that audits changes for quality, bugs, and project conventions.',
  experimental: true,
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        taskDescription: {
          type: 'string',
          description: 'The task that was supposed to be implemented.',
        },
        changes: {
          type: 'string',
          description: 'A description or diff of the changes to review.',
        },
      },
      required: ['taskDescription', 'changes'],
    },
  },
  outputConfig: {
    outputName: 'review',
    description: 'The review results including confidence score and issues.',
    schema: ReviewScoreSchema,
  },
  modelConfig: {
    model: config.getModel(),
  },
  get toolConfig() {
    // Reviewer uses read-only tools to verify code
    const tools = config.getToolRegistry().getAllToolNames().filter(t => 
      t.includes('read') || t.includes('ls') || t.includes('search') || t.includes('test')
    );
    return {
      tools,
    };
  },
  get promptConfig() {
    return {
      systemPrompt: `You are an expert code reviewer.
Your goal is to audit code changes against a task description and project conventions.

Your review MUST follow the ReviewScoreSchema:
1. Provide an overall confidence score (0-100) reflecting how certain you are of your findings.
2. List specific issues found, including their severity (low, medium, high, critical) and description.
3. If possible, provide the line number where the issue occurs.

Focus on:
- Functional correctness (does it actually solve the task?)
- Bug detection (race conditions, edge cases, security flaws)
- Simplicity and maintainability (DRY, naming, complexity)
- Project convention compliance.

Be objective. If the code is excellent, give a high confidence score and an empty issues list.`,
      query: 'Review these changes for the task: ${taskDescription}. Changes: ${changes}',
    };
  },
  runConfig: {
    maxTimeMinutes: 5,
    maxTurns: 10,
  },
});
