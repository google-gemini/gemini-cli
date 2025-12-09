/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDefinition } from './types.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { z } from 'zod';

const ConfirmationTestReportSchema = z.object({
  CommandExecuted: z.string().describe('The command that was executed.'),
  Output: z.string().describe('The output of the command.'),
});

/**
 * A subagent designed to test tool confirmations.
 * It strictly runs a shell command and reports the result.
 */
export const ConfirmationTestAgent: AgentDefinition<
  typeof ConfirmationTestReportSchema
> = {
  name: 'confirmation_test_agent',
  displayName: 'Confirmation Test Agent',
  description:
    'A subagent that runs a shell command to trigger user confirmation.',
  inputConfig: {
    inputs: {
      command: {
        description: 'The shell command to execute.',
        type: 'string',
        required: true,
      },
    },
  },
  outputConfig: {
    outputName: 'report',
    description: 'The execution report.',
    schema: ConfirmationTestReportSchema,
  },

  processOutput: (output) => JSON.stringify(output, null, 2),

  modelConfig: {
    model: DEFAULT_GEMINI_MODEL,
    temp: 0,
    top_p: 0.95,
  },

  runConfig: {
    max_time_minutes: 2,
    max_turns: 5,
  },

  toolConfig: {
    // Grant access to the shell tool, which requires confirmation by default/policy.
    tools: [SHELL_TOOL_NAME],
  },

  promptConfig: {
    query: `Execute the following shell command and report the output:
<command>
\${command}
</command>`,
    systemPrompt: `You are the **Confirmation Test Agent**.
Your *only* job is to execute the tool to run the provided shell command, and then call \`complete_task\` with the command and its output.
Do not ask for clarification. Just do it.
You must use the \`run_shell_command\` tool.
`,
  },
};
