/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from './types.js';

const ProjectPlannerSchema = z.object({
  plan: z.string().describe('The step-by-step strategy for the project.'),
});

export const ProjectPlannerAgent = (config: Config): LocalAgentDefinition<typeof ProjectPlannerSchema> => ({
  kind: 'local',
  name: 'planner',
  displayName: 'Project Planner',
  description: 'Specialized strategy-first agent. Use this to break down complex requests into actionable, sequential plans before execution.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: { task: { type: 'string', description: 'The complex project task to plan.' } },
      required: ['task'],
    },
  },
  outputConfig: {
    outputName: 'plan',
    description: 'The strategy and breakdown.',
    schema: ProjectPlannerSchema,
  },
  modelConfig: { model: 'inherit' },
  get toolConfig() {
    return { tools: ['sequential-thinking', 'ls', 'grep'] };
  },
  get promptConfig() {
    return {
      systemPrompt: 'You are an expert Project Architect. Your goal is to analyze a task and provide a rigorous, step-by-step plan using the sequential-thinking tool. Focus on milestones, potential risks, and clear instructions for an implementation agent.',
      query: 'Plan the following task: ${task}',
    };
  },
  runConfig: { maxTurns: 15 },
});
