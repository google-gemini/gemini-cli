/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { Config } from '../config/config.js';
import { getCoreSystemPrompt } from '../core/prompts.js';
import type { LocalAgentDefinition } from './types.js';
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';

const GeneralistAgentSchema = z.object({
  response: z.string().describe('The final response from the agent.'),
});

/**
 * A general-purpose AI agent with access to all tools.
 * It uses the same core system prompt as the main agent but in a non-interactive mode.
 */
export const GeneralistAgent = (
  config: Config,
): LocalAgentDefinition<typeof GeneralistAgentSchema> => ({
  kind: 'local',
  name: 'generalist',
  displayName: 'Generalist Agent',
  description:
    "A general-purpose AI agent with access to all tools. Use it for complex tasks that don't fit into other specialized agents.",
  experimental: true,
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: 'The task or question for the generalist agent.',
        },
      },
      required: ['request'],
    },
  },
  outputConfig: {
    outputName: 'result',
    description: 'The final answer or results of the task.',
    schema: GeneralistAgentSchema,
  },
  modelConfig: {
    model: 'inherit',
  },
  get toolConfig() {
    // TODO(15179): Support recursive agent invocation.
    const tools = config
      .getToolRegistry()
      .getAllToolNames()
      .filter((name) => name !== DELEGATE_TO_AGENT_TOOL_NAME);
    return {
      tools,
    };
  },
  get promptConfig() {
    return {
      systemPrompt: getCoreSystemPrompt(
        config,
        /*useMemory=*/ undefined,
        /*interactiveOverride=*/ false,
      ),
      query: '${request}',
    };
  },
  runConfig: {
    maxTimeMinutes: 10,
    maxTurns: 20,
  },
});
