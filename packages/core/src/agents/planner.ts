/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { getCoreSystemPrompt } from '../core/prompts.js';
import type { LocalAgentDefinition } from './types.js';
import { PlannerAgentSchema } from './planner-schema.js';
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
} from '../tools/tool-names.js';

/**
 * A specialized subagent for research and planning.
 * It operates with read-only tools (mostly) and is restricted to writing plans
 * until user approval is received.
 */
export const PlannerAgent = (
  config: Config,
): LocalAgentDefinition<typeof PlannerAgentSchema> => ({
  kind: 'local',
  name: 'planner',
  displayName: 'Planner Agent',
  description:
    'A specialized subagent for research and planning. It explores the codebase, designs solutions, and drafts detailed implementation plans for user approval.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'The reason for entering plan mode or the task to plan.',
        },
      },
      required: ['reason'],
    },
  },
  outputConfig: {
    outputName: 'plan_path',
    description: 'The path to the finalized and approved plan.',
    schema: PlannerAgentSchema,
  },
  processOutput: (output) => output.plan_path,
  modelConfig: {
    model: 'inherit',
  },
  runConfig: {
    maxTimeMinutes: 10,
    maxTurns: 20,
    completionToolName: EXIT_PLAN_MODE_TOOL_NAME,
    hasCustomEntryPoint: true,
  },
  toolConfig: {
    tools: [
      LS_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      GLOB_TOOL_NAME,
      GREP_TOOL_NAME,
      ASK_USER_TOOL_NAME,
      EXIT_PLAN_MODE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      WEB_SEARCH_TOOL_NAME,
      WEB_FETCH_TOOL_NAME,
    ],
  },
  promptConfig: {
    get systemPrompt() {
      return getCoreSystemPrompt(
        config,
        undefined, // userMemory
        false, // interactiveOverride
      );
    },
    query: 'Start planning for: ${reason}',
  },
});
