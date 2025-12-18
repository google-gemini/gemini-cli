/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { GEMINI_MODEL_ALIAS_PRO } from '../config/models.js';
import { z } from 'zod';

const ShellTestOutputSchema = z.object({
  output: z.string().describe('The output of the shell command.'),
});

/**
 * A test subagent that just runs a shell command.
 * Useful for testing confirmation interfaces and subagent tool calls.
 */
export const ShellTestAgent: AgentDefinition<typeof ShellTestOutputSchema> = {
  name: 'shell_test_agent',
  displayName: 'Shell Test Agent',
  description: 'A test subagent that runs a single shell command as requested.',
  inputConfig: {
    inputs: {
      objective: {
        description:
          "A comprehensive and detailed description of the user's ultimate goal. You must include original user's objective as well as questions and any extra context and questions you may have.",
        type: 'string',
        required: true,
      },
      command: {
        description: 'The shell command to execute.',
        type: 'string',
        required: true,
      },
    },
  },
  outputConfig: {
    outputName: 'result',
    description: 'The final result of the command execution.',
    schema: ShellTestOutputSchema,
  },

  processOutput: (output) => output.output,

  modelConfig: {
    model: GEMINI_MODEL_ALIAS_PRO,
    temp: 0.1,
    top_p: 0.95,
  },

  runConfig: {
    max_time_minutes: 2,
    max_turns: 5,
  },

  toolConfig: {
    tools: [SHELL_TOOL_NAME],
  },

  promptConfig: {
    query: 'Run the following command: ${command}',
    systemPrompt: `You are a test agent. Your ONLY job is to run the command provided in the input using the \`run_shell_command\` tool and then report the output. 
      Do not do anything else. Do not ask questions. Just run the command and report back.`,
  },
};
