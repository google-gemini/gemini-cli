/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from './types.js';

const CodeReviewerSchema = z.object({
  audit: z.string().describe('The security and quality audit report.'),
});

export const CodeReviewerAgent = (config: Config): LocalAgentDefinition<typeof CodeReviewerSchema> => ({
  kind: 'local',
  name: 'reviewer',
  displayName: 'Code Reviewer',
  description: 'Specialized agent for auditing code diffs, identifying security vulnerabilities, and ensuring style consistency.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: { diff: { type: 'string', description: 'The code changes or files to audit.' } },
      required: ['diff'],
    },
  },
  outputConfig: {
    outputName: 'audit',
    description: 'The audit results.',
    schema: CodeReviewerSchema,
  },
  modelConfig: { model: 'inherit' },
  get toolConfig() {
    return { tools: ['read_file', 'grep'] };
  },
  get promptConfig() {
    return {
      systemPrompt: 'You are a Senior Security Engineer and Code Reviewer. Your goal is to perform a deep audit of the provided code. Look for: \n- Memory leaks\n- XSS/Injection risks\n- Inefficient patterns\n- Adherence to project style guides.',
      query: 'Review the following: ${diff}',
    };
  },
  runConfig: { maxTurns: 10 },
});
