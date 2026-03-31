/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { LocalAgentDefinition } from './types.js';
import {
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import * as path from 'node:path';

export const WatcherReportSchema = z.object({
  userDirections: z
    .string()
    .describe(
      'High level user directions/redirections and any change of plans.',
    ),
  progressSummary: z
    .string()
    .describe('Concise summary of the progress made by the agent.'),
  evaluation: z
    .string()
    .describe(
      'Evaluation of whether the agent is going in the right direction.',
    ),
  feedback: z
    .string()
    .optional()
    .describe('Feedback to the main agent if necessary.'),
});

/**
 * Watcher subagent specialized in monitoring the main agent's progress and direction.
 */
export const WatcherAgent = (
  context: AgentLoopContext,
): LocalAgentDefinition<typeof WatcherReportSchema> => {
  const projectTempDir = context.config.storage.getProjectTempDir();
  const statusFilePath = path.join(projectTempDir, 'watcher_status.md');

  return {
    name: 'watcher',
    kind: 'local',
    displayName: 'Watcher Agent',
    description:
      'Specialized agent that monitors the progress and direction of the main agent.',
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: {
          recentHistory: {
            type: 'string',
            description:
              'The transcript of the most recent turns of the conversation.',
          },
        },
        required: ['recentHistory'],
      },
    },
    outputConfig: {
      outputName: 'report',
      description: 'The progress report and evaluation.',
      schema: WatcherReportSchema,
    },

    processOutput: (output) => JSON.stringify(output, null, 2),

    modelConfig: {
      model: GEMINI_MODEL_ALIAS_FLASH,
      generateContentConfig: {
        temperature: 0.1,
        topP: 0.95,
      },
    },

    runConfig: {
      maxTimeMinutes: 2,
      maxTurns: 5,
    },

    toolConfig: {
      tools: [READ_FILE_TOOL_NAME, WRITE_FILE_TOOL_NAME],
    },

    promptConfig: {
      query: `Analyze the recent conversation history and update the progress status.
Status file path: ${statusFilePath}

<recent_history>
\${recentHistory}
</recent_history>`,
      systemPrompt: `You are **Watcher**, a specialized monitoring subagent. Your purpose is to ensure the main agent stays on track and follows the user's directions.

### Your Objectives:
1.  **Track Directions**: Identify high-level user directions, redirections, and any changes in plans.
2.  **Summarize Progress**: Provide a concise summary of the progress made in the last few turns.
3.  **Evaluate Direction**: Determine if the agent is moving towards the goal or if it's deviating/stuck.
4.  **Maintain Continuity**: Read the previous status update from the designated file if it exists, and always overwrite it with the latest findings.

### Instructions:
- **Read Previous Status**: Start by reading the status file: \`${statusFilePath}\`.
- **Analyze History**: Compare the recent history with the previous status and the overall goal (if a plan file exists).
- **Update Status**: Write the updated status back to \`${statusFilePath}\` in a clear Markdown format.
- **Provide Feedback**: If the agent is going in the wrong direction or is stuck, provide specific feedback to be shared with the main agent. If everything is on track, feedback should be empty or a simple confirmation.

### Status File Format:
\`\`\`md
# Watcher Status Update
## User Directions
[Summary of initial goal and changes]

## Progress Summary
[Concise summary of actions taken]

## Evaluation
[Is it on track? Is it following the plan?]
\`\`\`

You MUST call \`complete_task\` with a JSON report containing \`userDirections\`, \`progressSummary\`, \`evaluation\`, and optional \`feedback\`.`,
    },
  };
};
