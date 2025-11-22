/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { AgentDefinition } from './types.js';
import {
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from '../tools/tool-names.js';

// Output schema for parallel analysis
const ParallelAnalysisReportSchema = z.object({
  ExecutiveSummary: z
    .string()
    .describe('High-level synthesis of all agent findings'),

  AgentReports: z.array(
    z.object({
      AgentFocus: z.string().describe('What this agent analyzed'),
      KeyFindings: z.array(z.string()),
      Confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),

  ConsensusFindings: z.array(
    z.object({
      Finding: z.string(),
      SupportingAgents: z
        .number()
        .describe('How many agents found this'),
      Evidence: z.array(z.string()),
    }),
  ),

  Conflicts: z
    .array(
      z.object({
        Issue: z.string(),
        ConflictingViews: z.array(z.string()),
      }),
    )
    .optional(),

  Recommendations: z.array(z.string()),
});

/**
 * Parallel Analyzer Agent
 *
 * Coordinates multiple codebase_investigator agents to run in parallel.
 * Key: by calling multiple subagent tools in a SINGLE turn, they execute
 * concurrently via Promise.all() in executor.ts processFunctionCalls().
 */
export const ParallelAnalyzerAgent: AgentDefinition<
  typeof ParallelAnalysisReportSchema
> = {
  name: 'parallel_analyzer',
  displayName: 'Parallel Analyzer',

  description: `Coordinates multiple analyzer agents in parallel to investigate from different angles simultaneously. Returns consensus report.`,

  inputConfig: {
    inputs: {
      task: {
        description: 'The main task or question to investigate',
        type: 'string',
        required: true,
      },
      agent_count: {
        description: 'Number of parallel agents to spawn (2-10)',
        type: 'number',
        required: false,
      },
      focus_areas: {
        description: 'Optional array of specific areas to investigate',
        type: 'array',
        items: { type: 'string' },
        required: false,
      },
    },
  },

  outputConfig: {
    outputName: 'analysis_report',
    description: 'Consensus report from all parallel agents',
    schema: ParallelAnalysisReportSchema,
  },

  toolConfig: {
    tools: [
      'codebase_investigator',
      LS_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      GREP_TOOL_NAME,
      GLOB_TOOL_NAME,
      READ_MANY_FILES_TOOL_NAME,
      WEB_SEARCH_TOOL_NAME,
    ],
  },

  modelConfig: {
    model: 'gemini-2.0-flash-001',
    temp: 0.7,
    top_p: 0.95,
    thinkingBudget: 8000,
  },

  runConfig: {
    max_time_minutes: 10,
    max_turns: 20,
  },

  promptConfig: {
    systemPrompt: `You coordinate multiple codebase_investigator agents IN PARALLEL.

**CRITICAL: Call codebase_investigator MULTIPLE TIMES in ONE TURN**

Example turn:
- codebase_investigator(objective: "Find authentication patterns")
- codebase_investigator(objective: "Find database patterns")
- codebase_investigator(objective: "Find error handling")
- codebase_investigator(objective: "Find API patterns")

Then synthesize findings into consensus report with complete_task.

Inputs: task={{task}}, agent_count={{agent_count}}, focus_areas={{focus_areas}}`,

    initialMessages: [],
  },

  processOutput: (output) => JSON.stringify(output, null, 2),
};
