/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { LocalAgentDefinition } from './types.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

const AgentDebuggerOutputSchema = z.object({
  diagnosis: z
    .string()
    .describe('The diagnosis of why the agent failed or misbehaved.'),
  suggestions: z
    .array(z.string())
    .describe('Suggestions for fixing the agent or prompt.'),
});

export const AgentDebuggerAgent: LocalAgentDefinition<
  typeof AgentDebuggerOutputSchema
> = {
  name: 'agent-debugger',
  kind: 'local',
  displayName: 'Agent Debugger',
  description:
    'Diagnoses issues with custom agents and offers suggestions for improvement.',
  inputConfig: {
    inputs: {
      target_agent_name: {
        description: 'The name of the agent being debugged.',
        type: 'string',
        required: true,
      },
      agent_definition: {
        description:
          'The full text definition of the agent, including system prompt and configuration.',
        type: 'string',
        required: true,
      },
      problem_description: {
        description:
          'The user-provided description of the problem or the failed prompt.',
        type: 'string',
        required: true,
      },
    },
  },
  outputConfig: {
    outputName: 'report',
    description: 'The diagnosis report.',
    schema: AgentDebuggerOutputSchema,
  },
  processOutput: (output) =>
    `## Diagnosis\n${output.diagnosis}\n\n## Suggestions\n${output.suggestions.map((s) => `- ${s}`).join('\n')}`,
  modelConfig: {
    model: DEFAULT_GEMINI_MODEL,
  },
  runConfig: {
    maxTimeMinutes: 2,
    maxTurns: 5,
  },
  promptConfig: {
    systemPrompt: `You are an expert at diagnosing issues with Gemini CLI agents.
Your goal is to analyze the provided agent definition and the user's reported problem to determine why the agent wasn't called or didn't behave as expected.

Analyze the following:
1. **Agent Definition:** Check the system prompt, input configuration, and tool availability.
2. **Problem Description:** Understand what the user was trying to do and what went wrong.
3. **Prompt/Query:** If provided, analyze if the user's prompt aligns with the agent's expected inputs and trigger phrases.

Provide a clear diagnosis and actionable suggestions.`,
    query: `I am debugging a custom agent named "\${target_agent_name}".

The user provided the following problem description:
"\${problem_description}"

Here is the agent definition:
\${agent_definition}

Please diagnose why the custom agent wasn't called or failed, and offer suggestions.`,
  },
};
