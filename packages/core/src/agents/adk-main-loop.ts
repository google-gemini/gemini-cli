/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { z } from 'zod';
import { resolveSystemPrompt } from '../core/prompts.js';
import type { Config } from '../config/config.js';
import * as toolNames from '../tools/tool-names.js';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';

const AdkMainLoopOutputSchema = z.object({
  WorkDone: z.string().describe('A detailed summary of all steps taken.'),
  ToolsCalled: z
    .array(z.string())
    .describe(
      'An ordered list of each tool call and the parameters passed to it.',
    ),
  FinalResult: z
    .string()
    .describe(
      'The final output of the main loop agent. This will be displayed to the user, and should be as comprehensive as possible.',
    ),
});

export const AdkMainLoopAgent: AgentDefinition<typeof AdkMainLoopOutputSchema> =
  {
    name: 'adk_main_loop',
    displayName: 'Main Loop Agent',
    description:
      'This agent has all necessary tools to complete end-to-end tasks.',
    inputConfig: {
      inputs: {
        objective: {
          description: 'The task as presented by the user.',
          type: 'string',
          required: true,
        },
      },
    },
    outputConfig: {
      outputName: 'result',
      description: 'The final result of the main loop agent.',
      schema: AdkMainLoopOutputSchema,
    },
    processOutput: (output) => JSON.stringify(output, null, 2),
    toolConfig: {
      tools: Object.values(toolNames),
    },
    subagentConfig: {
      subagents: [CodebaseInvestigatorAgent],
    },
    promptConfig: {
      query: `\${objective}`,
      systemPrompt: (config: Config) => {
        const userMemory = config.getUserMemory();
        const systemInstruction = resolveSystemPrompt(config, userMemory);
        return systemInstruction;
      },
    },
  };
