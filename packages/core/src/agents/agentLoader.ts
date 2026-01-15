/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yaml from 'js-yaml';
import * as fs from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { AgentDefinition } from './types.js';
import {
  isValidToolName,
  DELEGATE_TO_AGENT_TOOL_NAME,
} from '../tools/tool-names.js';
import { FRONTMATTER_REGEX } from '../skills/skillLoader.js';

/**
 * DTO for Markdown parsing - represents the structure from frontmatter.
 */
interface FrontmatterBaseAgentDefinition {
  name: string;
  display_name?: string;
}

interface FrontmatterLocalAgentDefinition
  extends FrontmatterBaseAgentDefinition {
  kind: 'local';
  description: string;
  tools?: string[];
  system_prompt: string;
  model?: string;
  temperature?: number;
  max_turns?: number;
  timeout_mins?: number;
}

interface FrontmatterRemoteAgentDefinition
  extends FrontmatterBaseAgentDefinition {
  kind: 'remote';
  description?: string;
  agent_card_url: string;
}

type FrontmatterAgentDefinition =
  | FrontmatterLocalAgentDefinition
  | FrontmatterRemoteAgentDefinition;

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
    model: z.string().optional(),
    temperature: z.number().optional(),
    max_turns: z.number().int().positive().optional(),
    timeout_mins: z.number().int().positive().optional(),
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

// Use a Zod union to automatically discriminate between local and remote
// agent types.
const agentUnionOptions = [
  { schema: localAgentSchema, label: 'Local Agent' },
  { schema: remoteAgentSchema, label: 'Remote Agent' },
] as const;

const remoteAgentsListSchema = z.array(remoteAgentSchema);

const markdownFrontmatterSchema = z.union([
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
 * Parses and validates an agent Markdown file with frontmatter.
 *
 * @param filePath Path to the Markdown file.
 * @returns An array containing the single parsed agent definition.
 * @throws AgentLoadError if parsing or validation fails.
 */
export async function parseAgentMarkdown(
  filePath: string,
): Promise<FrontmatterAgentDefinition[]> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      `Could not read file: ${(error as Error).message}`,
    );
  }

  // Split frontmatter and body
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new AgentLoadError(
      filePath,
      'Invalid agent definition: Missing mandatory YAML frontmatter. Agent Markdown files MUST start with YAML frontmatter enclosed in triple-dashes "---" (e.g., ---\nname: my-agent\n---).',
    );
  }

  const frontmatterStr = match[1];
  const body = match[2] || '';

  let rawFrontmatter: unknown;
  try {
    rawFrontmatter = yaml.load(frontmatterStr);
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      `YAML frontmatter parsing failed: ${(error as Error).message}`,
    );
  }

  // Handle array of remote agents
  if (Array.isArray(rawFrontmatter)) {
    const result = remoteAgentsListSchema.safeParse(rawFrontmatter);
    if (!result.success) {
      throw new AgentLoadError(
        filePath,
        `Validation failed: ${formatZodError(result.error, 'Remote Agents List')}`,
      );
    }
    return result.data.map((agent) => ({
      ...agent,
      kind: 'remote',
    }));
  }

  const result = markdownFrontmatterSchema.safeParse(rawFrontmatter);

  if (!result.success) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: ${formatZodError(result.error, 'Agent Definition')}`,
    );
  }

  const frontmatter = result.data;

  if (frontmatter.kind === 'remote') {
    return [
      {
        ...frontmatter,
        kind: 'remote',
      },
    ];
  }

  // Local agent validation
  // Validate tools
  if (
    frontmatter.tools &&
    frontmatter.tools.includes(DELEGATE_TO_AGENT_TOOL_NAME)
  ) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: tools list cannot include '${DELEGATE_TO_AGENT_TOOL_NAME}'. Sub-agents cannot delegate to other agents.`,
    );
  }

  // Construct the local agent definition
  const agentDef: FrontmatterLocalAgentDefinition = {
    ...frontmatter,
    kind: 'local',
    system_prompt: body.trim(),
  };

  return [agentDef];
}

/**
 * Converts a FrontmatterAgentDefinition DTO to the internal AgentDefinition structure.
 *
 * @param markdown The parsed Markdown/Frontmatter definition.
 * @returns The internal AgentDefinition.
 */
export function markdownToAgentDefinition(
  markdown: FrontmatterAgentDefinition,
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

  if (markdown.kind === 'remote') {
    return {
      kind: 'remote',
      name: markdown.name,
      description: markdown.description || '(Loading description...)',
      displayName: markdown.display_name,
      agentCardUrl: markdown.agent_card_url,
      inputConfig,
    };
  }

  // If a model is specified, use it. Otherwise, inherit
  const modelName = markdown.model || 'inherit';

  return {
    kind: 'local',
    name: markdown.name,
    description: markdown.description,
    displayName: markdown.display_name,
    promptConfig: {
      systemPrompt: markdown.system_prompt,
      query: '${query}',
    },
    modelConfig: {
      model: modelName,
      generateContentConfig: {
        temperature: markdown.temperature ?? 1,
        topP: 0.95,
      },
    },
    runConfig: {
      maxTurns: markdown.max_turns,
      maxTimeMinutes: markdown.timeout_mins || 5,
    },
    toolConfig: markdown.tools
      ? {
          tools: markdown.tools,
        }
      : undefined,
    inputConfig,
  };
}

/**
 * Loads all agents from a specific directory.
 * Ignores files starting with _ and non-supported extensions.
 * Supported extensions: .md
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

  const files = dirEntries.filter(
    (entry) =>
      entry.isFile() &&
      !entry.name.startsWith('_') &&
      entry.name.endsWith('.md'),
  );

  for (const entry of files) {
    const filePath = path.join(dir, entry.name);
    try {
      const agentDefs = await parseAgentMarkdown(filePath);
      for (const def of agentDefs) {
        const agent = markdownToAgentDefinition(def);
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
