/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { getCoreSystemPrompt } from '../core/prompts.js';
import type { LocalAgentDefinition } from './types.js';

export const CLOUD_SUBAGENT_NAME = 'cloud_subagent';

const CloudSubagentOutputSchema = z.object({
  summary: z
    .string()
    .describe(
      'A polished summary of findings, decisions, and outcomes from the delegated cloud task.',
    ),
});

export const CloudSubagent = (
  context: AgentLoopContext,
): LocalAgentDefinition<typeof CloudSubagentOutputSchema> => ({
  kind: 'local',
  name: CLOUD_SUBAGENT_NAME,
  displayName: 'cloud-subagent',
  description:
    'Delegation specialist for complex or high-context tasks while offline mode is enabled. Use when work is likely to be long-running, high-volume, or exploratory, then return a crisp and elegant summary.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description:
            'The delegated task to execute in the cloud context. Include both what to do and why cloud delegation is justified.',
        },
      },
      required: ['request'],
    },
  },
  outputConfig: {
    outputName: 'result',
    description: 'A concise but eloquent summary of the delegated task result.',
    schema: CloudSubagentOutputSchema,
  },
  processOutput: (output) => output.summary,
  modelConfig: {
    model: 'inherit',
  },
  get toolConfig() {
    const tools = (context.toolRegistry?.getAllToolNames() ?? []).filter(
      (toolName) => toolName !== CLOUD_SUBAGENT_NAME,
    );
    return {
      tools,
    };
  },
  get promptConfig() {
    return {
      query: '${request}',
      systemPrompt: `${getCoreSystemPrompt(
        context.config,
        /* useMemory */ undefined,
        /* interactiveOverride */ false,
      )}

# Cloud Delegation Protocol

- You are the dedicated cloud execution specialist.
- Prioritize complex, high-volume, or exploratory work delegated by the main offline-mode agent.
- Execute thoroughly, but keep the final answer compact and structured.
- Your final summary must be elegant and useful:
  - Outcome first.
  - Key findings and decisions second.
  - Important caveats or follow-ups last.
- Avoid unnecessary verbosity and avoid exposing internal deliberation.

You MUST call \`complete_task\` with a JSON object containing the \`summary\`.`,
    };
  },
  runConfig: {
    maxTimeMinutes: 15,
    maxTurns: 25,
  },
});
