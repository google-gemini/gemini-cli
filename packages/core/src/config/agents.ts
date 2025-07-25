/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

import { readConfigFile, writeConfigFile } from './utils.js';

export const AGENTS_CONFIG_PATH = 'agents.json';

/**
 * The schema for a single agent configuration.
 */
export const AgentSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  role: z.string().optional(),
});

/**
 * The schema for the agents configuration file.
 */
export const AgentsConfigSchema = z.object({
  version: z.literal('1'),
  agents: z.array(AgentSchema),
});

export type Agent = z.infer<typeof AgentSchema>;
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  version: '1',
  agents: [],
};

/**
 * Reads the agents configuration file and returns the parsed content.
 * If the file does not exist, it returns the default configuration.
 */
export async function readAgentsConfig(): Promise<AgentsConfig> {
  return readConfigFile(
    AGENTS_CONFIG_PATH,
    AgentsConfigSchema,
    DEFAULT_AGENTS_CONFIG,
  );
}

/**
 * Writes the given agents configuration to the file.
 */
export async function writeAgentsConfig(config: AgentsConfig): Promise<void> {
  await writeConfigFile(AGENTS_CONFIG_PATH, config);
}
