/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import toml from '@iarna/toml';
import { type AgentDefinition } from './types.js';

/**
 * Zod schema for the TOML configuration of an agent.
 * This mirrors AgentDefinition but with types compatible with TOML (e.g. strings for tools).
 */
const AgentTomlSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  icon: z.string().optional(),
  description: z.string(),
  promptConfig: z.object({
    systemPrompt: z.string().optional(),
    initialMessages: z.array(z.any()).optional(), // Content[] is complex to validate fully in Zod without circular deps, accepting any for now
    query: z.string().optional(),
  }),
  modelConfig: z.object({
    model: z.string(),
    temp: z.number(),
    top_p: z.number(),
    thinkingBudget: z.number().optional(),
  }),
  runConfig: z.object({
    max_time_minutes: z.number(),
    max_turns: z.number().optional(),
  }),
  toolConfig: z
    .object({
      tools: z.array(z.string()),
    })
    .optional(),
  inputConfig: z.object({
    inputs: z.record(
      z.object({
        description: z.string(),
        type: z.enum([
          'string',
          'number',
          'boolean',
          'integer',
          'string[]',
          'number[]',
        ]),
        required: z.boolean(),
      }),
    ),
  }),
  outputConfig: z
    .object({
      outputName: z.string(),
      description: z.string(),
      // We can't easily define a Zod schema in TOML, so we default to z.unknown() or simple types if needed.
      // For now, we'll assume the output is unstructured or managed by the schema field if we decide to support JSON schema in TOML later.
    })
    .optional(),
});

export async function loadAgentFromToml(
  filePath: string,
): Promise<AgentDefinition<any>> {
  const content = await fs.readFile(filePath, 'utf-8');

  return parseAgentToml(content, filePath);
}

export function parseAgentToml(
  content: string,

  filePath?: string,
): AgentDefinition<any> {
  const raw = toml.parse(content);

  const parsed = AgentTomlSchema.parse(raw);

  // Map TOML-friendly structure to AgentDefinition

  const definition: AgentDefinition<any> = {
    name: parsed.name,
    displayName: parsed.displayName,
    icon: parsed.icon,
    filePath,
    description: parsed.description,

    promptConfig: parsed.promptConfig,

    modelConfig: parsed.modelConfig,

    runConfig: parsed.runConfig,

    toolConfig: parsed.toolConfig,

    inputConfig: parsed.inputConfig,

    outputConfig: parsed.outputConfig
      ? {
          outputName: parsed.outputConfig.outputName,

          description: parsed.outputConfig.description,

          schema: z.unknown(), // Default to unknown schema for TOML-defined agents for now
        }
      : undefined,
  };

  return definition;
}
