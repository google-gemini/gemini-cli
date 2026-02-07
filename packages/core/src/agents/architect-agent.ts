/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { type LocalAgentDefinition, PlanProposalSchema } from './types.js';

/**
 * An agent specialized in analyzing codebases and designing implementation plans.
 */
export const ArchitectAgent = (
  config: Config,
): LocalAgentDefinition<typeof PlanProposalSchema> => ({
  kind: 'local',
  name: 'architect',
  displayName: 'Architect Agent',
  description:
    'An expert software architect that analyzes codebases and designs implementation plans.',
  experimental: true,
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: 'The feature or refactoring request to design.',
        },
      },
      required: ['request'],
    },
  },
  outputConfig: {
    outputName: 'plan',
    description: 'The proposed implementation plan.',
    schema: PlanProposalSchema,
  },
  modelConfig: {
    model: config.getModel(),
  },
  get toolConfig() {
    // Architect primarily uses native read-only tools for codebase exploration.
    // We explicitly whitelist native tools to avoid any MCP tool conflicts.
    const whitelist = [
      'read_file',
      'read_many_files',
      'list_directory',
      'grep_search',
      'glob',
      'lsp_find_references',
      'lsp_go_to_definition',
    ];
    const tools = config
      .getToolRegistry()
      .getAllToolNames()
      .filter((t) => whitelist.includes(t));
    return {
      tools,
    };
  },
  get promptConfig() {
    return {
      systemPrompt: `You are an expert software architect.
Your goal is to analyze the codebase and design a detailed implementation plan for the requested feature or refactor.

Your plan MUST follow the PlanProposalSchema:
1. Provide a clear title and description.
2. Provide a list of "steps" as an array of strings.
3. Each step should be a single actionable sentence.

Example format:
{
  "title": "My Feature",
  "description": "...",
  "steps": ["Create file X", "Update function Y"]
}

Use your tools to explore the codebase, understand existing patterns, and identify all necessary changes before finalizing the plan.`,
      query: '${request}',
    };
  },
  runConfig: {
    maxTimeMinutes: 10,
    maxTurns: 15,
  },
});
