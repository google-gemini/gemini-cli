/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

import { readConfigFile, writeConfigFile } from './utils.js';

export const ACTIVE_AGENT_CONFIG_PATH = 'active_agent.json';

/**
 * The schema for the active agent configuration.
 */
export const ActiveAgentSchema = z.object({
  name: z.string().optional(),
});

export type ActiveAgent = z.infer<typeof ActiveAgentSchema>;

const DEFAULT_ACTIVE_AGENT_CONFIG: ActiveAgent = {};

/**
 * Reads the active agent configuration file.
 */
export async function readActiveAgent(): Promise<ActiveAgent> {
  return readConfigFile(
    ACTIVE_AGENT_CONFIG_PATH,
    ActiveAgentSchema,
    DEFAULT_ACTIVE_AGENT_CONFIG,
  );
}

/**
 * Writes the active agent configuration to the file.
 */
export async function writeActiveAgent(config: ActiveAgent): Promise<void> {
  await writeConfigFile(ACTIVE_AGENT_CONFIG_PATH, config);
}
