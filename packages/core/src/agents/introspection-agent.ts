/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { GetInternalDocsTool } from '../tools/get-internal-docs.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import { z } from 'zod';

const IntrospectionReportSchema = z.object({
  answer: z
    .string()
    .describe('The detailed answer to the user question about Gemini CLI.'),
  sources: z
    .array(z.string())
    .describe('The documentation files used to answer the question.'),
});

/**
 * An agent specialized in answering questions about Gemini CLI itself,
 * using its own documentation and runtime state.
 */
export const IntrospectionAgent: AgentDefinition<
  typeof IntrospectionReportSchema
> = {
  name: 'introspection_agent',
  kind: 'local',
  displayName: 'Introspection Agent',
  description:
    'Specialized in answering questions about yourself (Gemini CLI): features, documentation, and current runtime configuration.',
  inputConfig: {
    inputs: {
      question: {
        description: 'The specific question about Gemini CLI.',
        type: 'string',
        required: true,
      },
    },
  },
  outputConfig: {
    outputName: 'report',
    description: 'The final answer and sources as a JSON object.',
    schema: IntrospectionReportSchema,
  },

  processOutput: (output) => JSON.stringify(output, null, 2),

  modelConfig: {
    model: GEMINI_MODEL_ALIAS_FLASH,
    temp: 0.1,
    top_p: 0.95,
    thinkingBudget: -1,
  },

  runConfig: {
    max_time_minutes: 3,
    max_turns: 10,
  },

  toolConfig: {
    tools: [new GetInternalDocsTool()],
  },

  promptConfig: {
    query:
      'Your task is to answer the following question about Gemini CLI:\n' +
      '<question>\n' +
      '${question}\n' +
      '</question>',
    systemPrompt:
      "You are **Introspection Agent**, an expert on Gemini CLI. Your purpose is to provide accurate information about Gemini CLI's features, configuration, and current state.\n\n" +
      '### Runtime Context\n' +
      '- **CLI Version:** ${cliVersion}\n' +
      '- **Active Model:** ${activeModel}\n' +
      "- **Today's Date:** ${today}\n\n" +
      '### Instructions\n' +
      "1. **Explore Documentation**: Use the `get_internal_docs` tool to find answers. If you don't know where to start, call `get_internal_docs()` without arguments to see the full list of available documentation files.\n" +
      '2. **Be Precise**: Use the provided runtime context and documentation to give exact answers.\n' +
      '3. **Cite Sources**: Always include the specific documentation files you used in your final report.\n' +
      '4. **Non-Interactive**: You operate in a loop and cannot ask the user for more info. If the question is ambiguous, answer as best as you can with the information available.\n\n' +
      'You MUST call `complete_task` with a JSON report containing your `answer` and the `sources` you used.',
  },
};
