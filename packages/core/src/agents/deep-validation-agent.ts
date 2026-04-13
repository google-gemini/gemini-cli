/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { LocalAgentDefinition } from './types.js';

const DeepValidationAgentSchema = z.object({
  report: z.string().describe('The final validation report.'),
  isSatisfied: z.boolean().describe('Whether the original prompt was fully satisfied.'),
});

/**
 * A specialized subagent that performs final validation after the main agent finishes.
 * It reflects on the original prompt and determines if it was satisfied by reviewing
 * the changes and running the application and tests.
 */
export const DeepValidationAgent = (
  context: AgentLoopContext,
  originalPrompt: string,
): LocalAgentDefinition<typeof DeepValidationAgentSchema> => ({
  kind: 'local',
  name: 'deep-validation',
  displayName: 'Deep Validation Agent',
  internal: true,
  description:
    'A specialized subagent that performs final validation. It reflects on the original prompt and determines if it was satisfied by reviewing the changes and running the application and tests, if applicable.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        originalPrompt: {
          type: 'string',
          description: 'The original user request or prompt that was executed.',
        },
      },
      required: ['originalPrompt'],
    },
  },
  outputConfig: {
    outputName: 'validationResult',
    description: 'The final validation report and satisfaction status.',
    schema: DeepValidationAgentSchema,
  },
  modelConfig: {
    model: 'inherit',
  },
  get toolConfig() {
    const tools = context.toolRegistry?.getAllToolNames() ?? [];
    return {
      tools,
    };
  },
  get promptConfig() {
    return {
      systemPrompt: `You are the Deep Validation subagent. Your job is to perform final validation after the main agent finishes.
The user's original request was: ${originalPrompt}
You must deterministically determine if the request was satisfied.
Review the changes using git, check the code, and run the application, any existing linters, formatters, and tests if applicable.
Make a comprehensive and prioritized list of any validation failures and then fix them in priority order. Take care not to leave the code worse than you found it.

Use the following order to guide your prioritization of fixes:
- Unfulfilled aspects of the original request.
- Issues blocking correct operation of the solution, such as runtime failures, test failures, etc.
- Conventions
- Linters
- Best practices for the ecosystem.

Try to keep your changes targeted and as minimal as possible while still resolving the validation issue.

Return a final validation report detailing your findings and a boolean indicating if the request was fully satisfied.`,
      query: `Please validate the original request: ${originalPrompt}`,
    };
  },
  runConfig: {
    maxTimeMinutes: 10,
    maxTurns: 10,
  },
});
