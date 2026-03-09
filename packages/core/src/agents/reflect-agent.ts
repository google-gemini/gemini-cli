/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LocalAgentDefinition } from './types.js';
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  GET_SESSION_HISTORY_TOOL_NAME,
} from '../tools/tool-names.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { z } from 'zod';
import type { Config } from '../config/config.js';

// Define a type that matches the outputConfig schema for type safety.
const ReflectAgentReportSchema = z.object({
  SummaryOfFindings: z
    .string()
    .describe(
      'A summary of what was learned during reflection, including any new skills or memories created.',
    ),
  CreatedSkills: z
    .array(z.string())
    .describe('A list of skill files created or updated.'),
  AddedMemories: z
    .array(z.string())
    .describe('A list of global memories added to GEMINI.md.'),
});

/**
 * A subagent specialized in reflecting on session history and preserving
 * reusable knowledge as skills or memories.
 */
export const ReflectAgent = (
  _config: Config,
): LocalAgentDefinition<typeof ReflectAgentReportSchema> => ({
  name: 'reflect_agent',
  kind: 'local',
  displayName: 'Reflect Agent',
  description: `A specialized agent that reads the current chat history, identifies reusable knowledge or workflows, and saves them as skills or memories.`,
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  outputConfig: {
    outputName: 'report',
    description: 'The final reflection report as a JSON object.',
    schema: ReflectAgentReportSchema,
  },

  processOutput: (output) => JSON.stringify(output, null, 2),

  modelConfig: {
    model: DEFAULT_GEMINI_MODEL,
    generateContentConfig: {
      temperature: 0.1,
      topP: 0.95,
    },
  },

  runConfig: {
    maxTimeMinutes: 3,
    maxTurns: 10,
  },

  toolConfig: {
    tools: [
      GET_SESSION_HISTORY_TOOL_NAME,
      LS_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      GLOB_TOOL_NAME,
      GREP_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      EDIT_TOOL_NAME,
    ],
  },

  promptConfig: {
    query: `Please review the current session history and save any valuable learnings as skills or memories.`,
    systemPrompt: `You are the **Reflect Agent**, a specialized AI agent responsible for continuous learning. Your purpose is to review the current session's chat history, identify high-value, reusable knowledge or workflows, and persist them.

## Core Directives
1. **Retrieve History:** Your very first action MUST be to call the \`get_session_history\` tool to read what happened during this session.
2. **Analyze & Extract:** Look for complex workflows, specific project conventions, repeated commands, or user preferences that the agent should remember for future tasks.
3. **Persist Knowledge:**
   - **Memories:** For general, workspace-level preferences (e.g., "always use 2 spaces", "use strict typescript"), update the \`GEMINI.md\` file using \`${WRITE_FILE_TOOL_NAME}\` or \`${EDIT_TOOL_NAME}\`.
   - **Skills:** For complex, task-specific scripts or workflows, create a new skill in the \`.gemini/skills/\` directory. A skill requires a \`SKILL.md\` file containing the rules and resources.
4. **Local Changes Only:** Only modify files in the \`.gemini/\` directory or the \`GEMINI.md\` file. Do NOT modify the main application source code.
5. **Format Report:** Once you have saved the learnings, call the \`complete_task\` tool with a structured JSON report detailing what you found and what you saved.
`,
  },
});
