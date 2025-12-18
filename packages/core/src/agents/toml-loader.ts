/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import TOML from '@iarna/toml';
import * as fs from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { AgentDefinition } from './types.js';
import {
  isValidToolName,
  DELEGATE_TO_AGENT_TOOL_NAME,
} from '../tools/tool-names.js';

/**
 * DTO for TOML parsing - represents the raw structure of the TOML file.
 */
interface TomlAgentDefinition {
  name: string;
  description: string;
  display_name?: string;
  tools?: string[];
  prompts: {
    system_prompt: string;
    query?: string;
  };
  model?: {
    model?: string;
    temperature?: number;
  };
  run?: {
    max_turns?: number;
    timeout_mins?: number;
  };
}

/**
 * Error thrown when an agent definition is invalid or cannot be loaded.
 */
export class AgentLoadError extends Error {
  constructor(
    public filePath: string,
    message: string,
  ) {
    super(`Failed to load agent from ${filePath}: ${message}`);
    this.name = 'AgentLoadError';
  }
}

/**
 * Result of loading agents from a directory.
 */
export interface AgentLoadResult {
  agents: AgentDefinition[];
  errors: AgentLoadError[];
}

const tomlSchema = z.object({
  name: z.string().regex(/^[a-z0-9-_]+$/, 'Name must be a valid slug'),
  description: z.string().min(1),
  display_name: z.string().optional(),
  tools: z
    .array(
      z.string().refine((val) => isValidToolName(val), {
        message: 'Invalid tool name',
      }),
    )
    .optional(),
  prompts: z.object({
    system_prompt: z.string().min(1),
    query: z.string().optional(),
  }),
  model: z
    .object({
      model: z.string().optional(),
      temperature: z.number().optional(),
    })
    .optional(),
  run: z
    .object({
      max_turns: z.number().int().positive().optional(),
      timeout_mins: z.number().int().positive().optional(),
    })
    .optional(),
});

/**
 * Parses and validates an agent TOML file.
 *
 * @param filePath Path to the TOML file.
 * @returns The parsed and validated TomlAgentDefinition.
 * @throws AgentLoadError if parsing or validation fails.
 */
export async function parseAgentToml(
  filePath: string,
): Promise<TomlAgentDefinition> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      `Could not read file: ${(error as Error).message}`,
    );
  }

  let raw: unknown;
  try {
    raw = TOML.parse(content);
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      `TOML parsing failed: ${(error as Error).message}`,
    );
  }

  const result = tomlSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new AgentLoadError(filePath, `Validation failed: ${issues}`);
  }

  const definition = result.data as TomlAgentDefinition;

  // Prevent sub-agents from delegating to other agents (to prevent recursion/complexity)
  if (definition.tools?.includes(DELEGATE_TO_AGENT_TOOL_NAME)) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: tools list cannot include '${DELEGATE_TO_AGENT_TOOL_NAME}'. Sub-agents cannot delegate to other agents.`,
    );
  }

  return definition;
}

/**
 * Converts a TomlAgentDefinition DTO to the internal AgentDefinition structure.
 *
 * @param toml The parsed TOML definition.
 * @returns The internal AgentDefinition.
 */
export function tomlToAgentDefinition(
  toml: TomlAgentDefinition,
): AgentDefinition {
  // If a model is specified, use it. Otherwise, inherit
  const modelName = toml.model?.model || 'inherit';

  return {
    kind: 'local',
    name: toml.name,
    description: toml.description,
    displayName: toml.display_name,
    promptConfig: {
      systemPrompt: toml.prompts.system_prompt,
      query: toml.prompts.query,
    },
    modelConfig: {
      model: modelName,
      temp: toml.model?.temperature ?? 1,
      top_p: 0.95,
    },
    runConfig: {
      max_turns: toml.run?.max_turns,
      max_time_minutes: toml.run?.timeout_mins || 5,
    },
    toolConfig: toml.tools
      ? {
          tools: toml.tools,
        }
      : undefined,
    // Default input config for MVA
    inputConfig: {
      inputs: {
        query: {
          type: 'string',
          description: 'The task for the agent.',
          required: false,
        },
      },
    },
  };
}

/**
 * Loads all agents from a specific directory.
 * Ignores non-TOML files and files starting with _.
 *
 * @param dir Directory path to scan.
 * @returns Object containing successfully loaded agents and any errors.
 */
export async function loadAgentsFromDirectory(
  dir: string,
): Promise<AgentLoadResult> {
  const result: AgentLoadResult = {
    agents: [],
    errors: [],
  };

  let dirEntries: Dirent[];
  try {
    dirEntries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    // If directory doesn't exist, just return empty
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return result;
    }
    result.errors.push(
      new AgentLoadError(
        dir,
        `Could not list directory: ${(error as Error).message}`,
      ),
    );
    return result;
  }

  const files = dirEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.toml') &&
        !entry.name.startsWith('_'),
    )
    .map((entry) => entry.name);

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const toml = await parseAgentToml(filePath);
      const agent = tomlToAgentDefinition(toml);
      result.agents.push(agent);
    } catch (error) {
      if (error instanceof AgentLoadError) {
        result.errors.push(error);
      } else {
        result.errors.push(
          new AgentLoadError(
            filePath,
            `Unexpected error: ${(error as Error).message}`,
          ),
        );
      }
    }
  }

  return result;
}
