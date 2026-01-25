/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from './types.js';

const NFSModderSchema = z.object({
  result: z.string().describe('The result of the modding operation or analysis.'),
});

export const NFSModderAgent = (config: Config): LocalAgentDefinition<typeof NFSModderSchema> => ({
  kind: 'local',
  name: 'nfsmodder',
  displayName: 'NFS Heat Modder',
  description: 'Specialized persona for Need for Speed Heat modding. Expert in configuration files (.cfg, .ini) and game data structures.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: { request: { type: 'string', description: 'The modding task or configuration query.' } },
      required: ['request'],
    },
  },
  outputConfig: {
    outputName: 'result',
    description: 'The modding output.',
    schema: NFSModderSchema,
  },
  modelConfig: { model: 'inherit' },
  get toolConfig() {
    return { tools: ['read_file', 'write_file', 'ls', 'grep'] };
  },
  get promptConfig() {
    return {
      systemPrompt: 'You are an expert NFS Heat Modder. You specialize in analyzing and modifying game configuration files like user.cfg and STORY files. Your goal is to help the user achieve specific gameplay outcomes (e.g. gameplay balance, graphics tweaks) by editing these files safely.',
      query: 'Modding request: ${request}',
    };
  },
  runConfig: { maxTurns: 10 },
});
