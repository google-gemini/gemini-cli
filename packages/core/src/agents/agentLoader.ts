/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { load } from 'js-yaml';
import * as fs from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import {
  type AgentDefinition,
  DEFAULT_MAX_TURNS,
  DEFAULT_MAX_TIME_MINUTES,
} from './types.js';
import type { A2AAuthConfig } from './auth-provider/types.js';
import { isValidToolName } from '../tools/tool-names.js';
import { FRONTMATTER_REGEX } from '../skills/skillLoader.js';
import { getErrorMessage } from '../utils/errors.js';

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

/**
 * Authentication configuration for remote agents in frontmatter format.
 */
interface FrontmatterAuthConfig {
  type: 'apiKey' | 'http';
  agent_card_requires_auth?: boolean;
  // API Key
  key?: string;
  name?: string;
  // HTTP
  scheme?: 'Bearer' | 'Basic';
  token?: string;
  username?: string;
  password?: string;
}

interface FrontmatterRemoteAgentDefinition
  extends FrontmatterBaseAgentDefinition {
  kind: 'remote';
  description?: string;
  agent_card_url: string;
  auth?: FrontmatterAuthConfig;
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

/**
 * Base fields shared by all auth configs.
 */
const baseAuthFields = {
  agent_card_requires_auth: z.boolean().optional(),
};

/**
 * API Key auth schema.
 * Supports sending key in header, query parameter, or cookie.
 */
const apiKeyAuthSchema = z.object({
  ...baseAuthFields,
  type: z.literal('apiKey'),
  key: z.string().min(1, 'API key is required'),
  name: z.string().optional(),
});

/**
 * HTTP auth schema (Bearer or Basic).
 * Note: Validation for scheme-specific fields is applied in authConfigSchema
 * since discriminatedUnion doesn't support refined schemas directly.
 */
const httpAuthSchema = z.object({
  ...baseAuthFields,
  type: z.literal('http'),
  scheme: z.enum(['Bearer', 'Basic']),
  token: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});

const authConfigSchema = z
  .discriminatedUnion('type', [apiKeyAuthSchema, httpAuthSchema])
  .superRefine((data, ctx) => {
    if (data.type === 'http') {
      if (data.scheme === 'Bearer' && !data.token) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Bearer scheme requires "token"',
          path: ['token'],
        });
      }
      if (data.scheme === 'Basic') {
        if (!data.username) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Basic authentication requires "username"',
            path: ['username'],
          });
        }
        if (!data.password) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Basic authentication requires "password"',
            path: ['password'],
          });
        }
      }
    }
  });

const remoteAgentSchema = z
  .object({
    kind: z.literal('remote').optional().default('remote'),
    name: nameSchema,
    description: z.string().optional(),
    display_name: z.string().optional(),
    agent_card_url: z.string().url(),
    auth: authConfigSchema.optional(),
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
 * @param content Optional pre-loaded content of the file.
 * @returns An array containing the single parsed agent definition.
 * @throws AgentLoadError if parsing or validation fails.
 */
export async function parseAgentMarkdown(
  filePath: string,
  content?: string,
): Promise<FrontmatterAgentDefinition[]> {
  let fileContent: string;
  if (content !== undefined) {
    fileContent = content;
  } else {
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new AgentLoadError(
        filePath,
        `Could not read file: ${getErrorMessage(error)}`,
      );
    }
  }

  // Split frontmatter and body
  const match = fileContent.match(FRONTMATTER_REGEX);
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
    rawFrontmatter = load(frontmatterStr);
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

  // Construct the local agent definition
  const agentDef: FrontmatterLocalAgentDefinition = {
    ...frontmatter,
    kind: 'local',
    system_prompt: body.trim(),
  };

  return [agentDef];
}

/**
 * Converts frontmatter auth config to the internal A2AAuthConfig type.
 * This handles the mapping from snake_case YAML to the internal type structure.
 */
function convertFrontmatterAuthToConfig(
  frontmatter: FrontmatterAuthConfig,
): A2AAuthConfig {
  const base = {
    agent_card_requires_auth: frontmatter.agent_card_requires_auth,
  };

  switch (frontmatter.type) {
    case 'apiKey':
      if (!frontmatter.key) {
        throw new Error('Internal error: API key missing after validation.');
      }
      return {
        ...base,
        type: 'apiKey',
        key: frontmatter.key,
        name: frontmatter.name,
      };

    case 'http': {
      if (!frontmatter.scheme) {
        throw new Error(
          'Internal error: HTTP scheme missing after validation.',
        );
      }
      switch (frontmatter.scheme) {
        case 'Bearer':
          if (!frontmatter.token) {
            throw new Error(
              'Internal error: Bearer token missing after validation.',
            );
          }
          return {
            ...base,
            type: 'http',
            scheme: 'Bearer',
            token: frontmatter.token,
          };
        case 'Basic':
          if (!frontmatter.username || !frontmatter.password) {
            throw new Error(
              'Internal error: Basic auth credentials missing after validation.',
            );
          }
          return {
            ...base,
            type: 'http',
            scheme: 'Basic',
            username: frontmatter.username,
            password: frontmatter.password,
          };
        default: {
          const exhaustive: never = frontmatter.scheme;
          throw new Error(`Unknown HTTP scheme: ${exhaustive}`);
        }
      }
    }

    default: {
      const exhaustive: never = frontmatter.type;
      throw new Error(`Unknown auth type: ${exhaustive}`);
    }
  }
}

/**
 * Converts a FrontmatterAgentDefinition DTO to the internal AgentDefinition structure.
 *
 * @param markdown The parsed Markdown/Frontmatter definition.
 * @param metadata Optional metadata including hash and file path.
 * @returns The internal AgentDefinition.
 */
export function markdownToAgentDefinition(
  markdown: FrontmatterAgentDefinition,
  metadata?: { hash?: string; filePath?: string },
): AgentDefinition {
  const inputConfig = {
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The task for the agent.',
        },
      },
      // query is not required because it defaults to "Get Started!" if not provided
      required: [],
    },
  };

  if (markdown.kind === 'remote') {
    return {
      kind: 'remote',
      name: markdown.name,
      description: markdown.description || '(Loading description...)',
      displayName: markdown.display_name,
      agentCardUrl: markdown.agent_card_url,
      auth: markdown.auth
        ? convertFrontmatterAuthToConfig(markdown.auth)
        : undefined,
      inputConfig,
      metadata,
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
      maxTurns: markdown.max_turns ?? DEFAULT_MAX_TURNS,
      maxTimeMinutes: markdown.timeout_mins ?? DEFAULT_MAX_TIME_MINUTES,
    },
    toolConfig: markdown.tools
      ? {
          tools: markdown.tools,
        }
      : undefined,
    inputConfig,
    metadata,
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return result;
    }
    result.errors.push(
      new AgentLoadError(
        dir,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
      const content = await fs.readFile(filePath, 'utf-8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const agentDefs = await parseAgentMarkdown(filePath, content);
      for (const def of agentDefs) {
        const agent = markdownToAgentDefinition(def, { hash, filePath });
        result.agents.push(agent);
      }
    } catch (error) {
      if (error instanceof AgentLoadError) {
        result.errors.push(error);
      } else {
        result.errors.push(
          new AgentLoadError(
            filePath,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            `Unexpected error: ${(error as Error).message}`,
          ),
        );
      }
    }
  }

  return result;
}
