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
interface TomlBaseAgentDefinition {
  name: string;
  display_name?: string;
}

interface TomlLocalAgentDefinition extends TomlBaseAgentDefinition {
  kind: 'local';
  description: string;
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

interface TomlRemoteAgentDefinition extends TomlBaseAgentDefinition {
  description?: string;
  kind: 'remote';
  agent_card_url: string;
}

type TomlAgentDefinition = TomlLocalAgentDefinition | TomlRemoteAgentDefinition;

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

const nameSchema = z
  .string()
  .regex(/^[a-z0-9-_]+$/, 'Name must be a valid slug');

const localAgentSchema = z
  .object({
    kind: z.literal('local').optional().default('local'),
    name: nameSchema,
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
  })
  .strict();

const remoteAgentSchema = z
  .object({
    kind: z.literal('remote').optional().default('remote'),
    name: nameSchema,
    description: z.string().optional(),
    display_name: z.string().optional(),
    agent_card_url: z.string().url(),
  })
  .strict();

const remoteAgentsConfigSchema = z
  .object({
    remote_agents: z.array(remoteAgentSchema),
  })
  .strict();

// Use a Zod union to automatically discriminate between local and remote
// agent types. This is more robust than manually checking the 'kind' field,
// as it correctly handles cases where 'kind' is omitted by relying on
// the presence of unique fields like `agent_card_url` or `prompts`.
const agentUnionOptions = [
  { schema: localAgentSchema, label: 'Local Agent' },
  { schema: remoteAgentSchema, label: 'Remote Agent' },
] as const;

const singleAgentSchema = z.union([
  agentUnionOptions[0].schema,
  agentUnionOptions[1].schema,
]);

function formatZodError(error: z.ZodError, context: string): string {
  const issues = error.issues
    .map((i) => {
      // Handle union errors specifically to give better context
      if (i.code === z.ZodIssueCode.invalid_union) {
        return i.unionErrors
          .map((unionError, index) => {
            const label =
              agentUnionOptions[index]?.label ?? `Agent type #${index + 1}`;
            const unionIssues = unionError.issues
              .map((u) => `${u.path.join('.')}: ${u.message}`)
              .join(', ');
            return `(${label}) ${unionIssues}`;
          })
          .join('\n');
      }
      return `${i.path.join('.')}: ${i.message}`;
    })
    .join('\n');
  return `${context}:\n${issues}`;
}

/**
 * Parses and validates an agent TOML file. Returns a validated array of RemoteAgentDefinitions or a single LocalAgentDefinition.
 *
 * @param filePath Path to the TOML file.
 * @returns An array of parsed and validated TomlAgentDefinitions.
 * @throws AgentLoadError if parsing or validation fails.
 */
export async function parseAgentToml(
  filePath: string,
): Promise<TomlAgentDefinition[]> {
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

  // Check for `remote_agents` array
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'remote_agents' in (raw as Record<string, unknown>)
  ) {
    const result = remoteAgentsConfigSchema.safeParse(raw);
    if (!result.success) {
      throw new AgentLoadError(
        filePath,
        `Validation failed: ${formatZodError(result.error, 'Remote Agents Config')}`,
      );
    }
    return result.data.remote_agents as TomlAgentDefinition[];
  }

  // Single Agent Logic
  const result = singleAgentSchema.safeParse(raw);

  if (!result.success) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: ${formatZodError(result.error, 'Agent Definition')}`,
    );
  }

  const toml = result.data as TomlAgentDefinition;

  // Prevent sub-agents from delegating to other agents (to prevent recursion/complexity)
  if ('tools' in toml && toml.tools?.includes(DELEGATE_TO_AGENT_TOOL_NAME)) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: tools list cannot include '${DELEGATE_TO_AGENT_TOOL_NAME}'. Sub-agents cannot delegate to other agents.`,
    );
  }

  return [toml];
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
  const inputConfig = {
    inputs: {
      query: {
        type: 'string' as const,
        description: 'The task for the agent.',
        required: false,
      },
    },
  };

  if (toml.kind === 'remote') {
    return {
      kind: 'remote',
      name: toml.name,
      description: toml.description || '(Loading description...)',
      displayName: toml.display_name,
      agentCardUrl: toml.agent_card_url,
      inputConfig,
    };
  }

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
    inputConfig,
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
      const tomls = await parseAgentToml(filePath);
      for (const toml of tomls) {
        const agent = tomlToAgentDefinition(toml);
        result.agents.push(agent);
      }
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
