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
  type RemoteAgentDefinition,
  DEFAULT_MAX_TURNS,
  DEFAULT_MAX_TIME_MINUTES,
} from './types.js';
import type { A2AAuthConfig } from './auth-provider/types.js';
import {
  MCPServerConfig,
  AuthProviderType,
  type MCPOAuthConfig,
} from '../config/config.js';
import { isValidToolName } from '../tools/tool-names.js';
import { FRONTMATTER_REGEX } from '../skills/skillLoader.js';
import { getErrorMessage } from '../utils/errors.js';

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

const mcpServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  http_url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  tcp: z.string().optional(),
  type: z.enum(['sse', 'http']).optional(),
  timeout: z.number().optional(),
  trust: z.boolean().optional(),
  description: z.string().optional(),
  include_tools: z.array(z.string()).optional(),
  exclude_tools: z.array(z.string()).optional(),
  auth: z
    .union([
      z.object({
        type: z.literal('google-credentials'),
        scopes: z.array(z.string()).optional(),
      }),
      z.object({
        type: z.literal('oauth'),
        client_id: z.string().optional(),
        client_secret: z.string().optional(),
        scopes: z.array(z.string()).optional(),
        authorization_url: z.string().url().optional(),
        token_url: z.string().url().optional(),
      }),
    ])
    .optional(),
});

const localAgentSchema = z
  .object({
    kind: z.literal('local').optional().default('local'),
    name: nameSchema,
    description: z.string().min(1),
    display_name: z.string().optional(),
    tools: z
      .array(
        z
          .string()
          .refine(
            (val: string) => isValidToolName(val, { allowWildcards: true }),
            {
              message: 'Invalid tool name',
            },
          ),
      )
      .optional(),
    mcp_servers: z.record(mcpServerSchema).optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    max_turns: z.number().int().positive().optional(),
    timeout_mins: z.number().int().positive().optional(),
  })
  .strict();

type FrontmatterLocalAgentDefinition = z.infer<typeof localAgentSchema> & {
  system_prompt: string;
};

// Base fields shared by all auth configs.
const baseAuthFields = {};

const apiKeyAuthSchema = z.object({
  ...baseAuthFields,
  type: z.literal('apiKey'),
  key: z.string().min(1, 'API key is required'),
  name: z.string().optional(),
});

const httpAuthSchema = z.object({
  ...baseAuthFields,
  type: z.literal('http'),
  scheme: z.string().min(1),
  token: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
});

const googleCredentialsAuthSchema = z.object({
  ...baseAuthFields,
  type: z.literal('google-credentials'),
  scopes: z.array(z.string()).optional(),
});

const oauth2AuthSchema = z.object({
  ...baseAuthFields,
  type: z.literal('oauth'),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  authorization_url: z.string().url().optional(),
  token_url: z.string().url().optional(),
});

const authConfigSchema = z
  .discriminatedUnion('type', [
    apiKeyAuthSchema,
    httpAuthSchema,
    googleCredentialsAuthSchema,
    oauth2AuthSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.type === 'http') {
      if (data.value) return;
      if (data.scheme === 'Bearer') {
        if (!data.token) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Bearer scheme requires "token"',
            path: ['token'],
          });
        }
      } else if (data.scheme === 'Basic') {
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
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `HTTP scheme "${data.scheme}" requires "value"`,
          path: ['value'],
        });
      }
    }
  });

type FrontmatterAuthConfig = z.infer<typeof authConfigSchema>;

const baseRemoteAgentSchema = z.object({
  kind: z.literal('remote').optional().default('remote'),
  name: nameSchema,
  description: z.string().optional(),
  display_name: z.string().optional(),
  auth: authConfigSchema.optional(),
});

const remoteAgentUrlSchema = baseRemoteAgentSchema
  .extend({
    agent_card_url: z.string().url(),
    agent_card_json: z.undefined().optional(),
  })
  .strict();

const remoteAgentJsonSchema = baseRemoteAgentSchema
  .extend({
    agent_card_url: z.undefined().optional(),
    agent_card_json: z.string().refine(
      (val: string) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'agent_card_json must be valid JSON' },
    ),
  })
  .strict();

const remoteAgentSchema = z.union([
  remoteAgentUrlSchema,
  remoteAgentJsonSchema,
]);

type FrontmatterRemoteAgentDefinition = z.infer<typeof remoteAgentSchema>;

type FrontmatterAgentDefinition =
  | FrontmatterLocalAgentDefinition
  | FrontmatterRemoteAgentDefinition;

const agentUnionOptions = [
  { label: 'Local Agent' },
  { label: 'Remote Agent' },
  { label: 'Remote Agent' },
];

const remoteAgentsListSchema = z.array(remoteAgentSchema);

const markdownFrontmatterSchema = z.union([
  localAgentSchema,
  remoteAgentUrlSchema,
  remoteAgentJsonSchema,
]);

function guessIntendedKind(rawInput: unknown): 'local' | 'remote' | undefined {
  if (typeof rawInput !== 'object' || rawInput === null) return undefined;
  const input = rawInput as Partial<FrontmatterLocalAgentDefinition> &
    Partial<FrontmatterRemoteAgentDefinition>;

  if (input.kind === 'local') return 'local';
  if (input.kind === 'remote') return 'remote';

  const hasLocalKeys =
    'tools' in input ||
    'mcp_servers' in input ||
    'model' in input ||
    'temperature' in input ||
    'max_turns' in input ||
    'timeout_mins' in input;
  const hasRemoteKeys =
    'agent_card_url' in input || 'auth' in input || 'agent_card_json' in input;

  if (hasLocalKeys && !hasRemoteKeys) return 'local';
  if (hasRemoteKeys && !hasLocalKeys) return 'remote';

  return undefined;
}

function formatZodError(
  error: z.ZodError,
  context: string,
  rawInput?: unknown,
): string {
  const intendedKind = rawInput ? guessIntendedKind(rawInput) : undefined;

  const formatIssues = (issues: z.ZodIssue[], unionPrefix?: string): string[] =>
    issues.flatMap((i) => {
      // Handle union errors specifically to give better context
      if (i.code === z.ZodIssueCode.invalid_union) {
        return i.unionErrors.flatMap((unionError, index) => {
          const label = unionPrefix
            ? unionPrefix
            : ((agentUnionOptions[index] as { label?: string })?.label ??
              `Branch #${index + 1}`);

          if (intendedKind === 'local' && label === 'Remote Agent') return [];
          if (intendedKind === 'remote' && label === 'Local Agent') return [];

          return formatIssues(unionError.issues, label);
        });
      }
      const prefix = unionPrefix ? `(${unionPrefix}) ` : '';
      const path = i.path.length > 0 ? `${i.path.join('.')}: ` : '';
      return `${prefix}${path}${i.message}`;
    });

  const formatted = Array.from(new Set(formatIssues(error.issues))).join('\n');
  return `${context}:\n${formatted}`;
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
      `YAML frontmatter parsing failed: ${getErrorMessage(error)}`,
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
      `Validation failed: ${formatZodError(result.error, 'Agent Definition', rawFrontmatter)}`,
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

  // Construct the local agent definition
  return [
    {
      ...frontmatter,
      kind: 'local',
      system_prompt: body.trim(),
    },
  ];
}

/**
 * Converts frontmatter auth config to the internal A2AAuthConfig type.
 * This handles the mapping from snake_case YAML to the internal type structure.
 */
function convertFrontmatterAuthToConfig(
  frontmatter: FrontmatterAuthConfig,
): A2AAuthConfig {
  switch (frontmatter.type) {
    case 'apiKey':
      return {
        type: 'apiKey',
        key: frontmatter.key,
        name: frontmatter.name,
      };

    case 'google-credentials':
      return {
        type: 'google-credentials',
        scopes: frontmatter.scopes,
      };

    case 'http':
      if (frontmatter.value) {
        return {
          type: 'http',
          scheme: frontmatter.scheme,
          value: frontmatter.value,
        };
      }
      switch (frontmatter.scheme) {
        case 'Bearer':
          // Token is required by schema validation
          return {
            type: 'http',
            scheme: 'Bearer',

            token: frontmatter.token!,
          };
        case 'Basic':
          // Username/password are required by schema validation
          return {
            type: 'http',
            scheme: 'Basic',
            username: frontmatter.username!,
            password: frontmatter.password!,
          };
        default:
          throw new Error(`Unknown HTTP scheme: ${frontmatter.scheme}`);
      }

    case 'oauth':
      return {
        type: 'oauth2',
        client_id: frontmatter.client_id,
        client_secret: frontmatter.client_secret,
        scopes: frontmatter.scopes,
        authorization_url: frontmatter.authorization_url,
        token_url: frontmatter.token_url,
      };

    default: {
      const exhaustive: never = frontmatter;
      const raw: unknown = exhaustive;
      if (typeof raw === 'object' && raw !== null && 'type' in raw) {
        throw new Error(`Unknown auth type: ${String(raw['type'])}`);
      }
      throw new Error('Unknown auth type');
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
    const base: RemoteAgentDefinition = {
      kind: 'remote',
      name: markdown.name,
      description: markdown.description || '',
      displayName: markdown.display_name,
      auth: markdown.auth
        ? convertFrontmatterAuthToConfig(markdown.auth)
        : undefined,
      inputConfig,
      metadata,
    };

    if (
      'agent_card_json' in markdown &&
      markdown.agent_card_json !== undefined
    ) {
      base.agentCardJson = markdown.agent_card_json;
      return base;
    }
    if ('agent_card_url' in markdown && markdown.agent_card_url !== undefined) {
      base.agentCardUrl = markdown.agent_card_url;
      return base;
    }

    throw new AgentLoadError(
      metadata?.filePath || 'unknown',
      'Unexpected state: neither agent_card_json nor agent_card_url present on remote agent',
    );
  }

  // If a model is specified, use it. Otherwise, inherit
  const modelName = markdown.model || 'inherit';

  const mcpServers: Record<string, MCPServerConfig> = {};
  if (markdown.mcp_servers) {
    for (const [name, config] of Object.entries(markdown.mcp_servers)) {
      let authProviderType: AuthProviderType | undefined = undefined;
      let oauth: MCPOAuthConfig | undefined = undefined;

      if (config.auth) {
        if (config.auth.type === 'google-credentials') {
          authProviderType = AuthProviderType.GOOGLE_CREDENTIALS;
          oauth = {
            enabled: true,
            scopes: config.auth.scopes,
          };
        } else if (config.auth.type === 'oauth') {
          oauth = {
            enabled: true,
            clientId: config.auth.client_id,
            clientSecret: config.auth.client_secret,
            scopes: config.auth.scopes,
            authorizationUrl: config.auth.authorization_url,
            tokenUrl: config.auth.token_url,
          };
        }
      }

      mcpServers[name] = new MCPServerConfig(
        config.command,
        config.args,
        config.env,
        config.cwd,
        config.url,
        config.http_url,
        config.headers,
        config.tcp,
        config.type,
        config.timeout,
        config.trust,
        config.description,
        config.include_tools,
        config.exclude_tools,
        undefined, // extension
        oauth,
        authProviderType,
      );
    }
  }

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
    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
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
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return result;
    }
    result.errors.push(
      new AgentLoadError(
        dir,
        `Could not list directory: ${getErrorMessage(error)}`,
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
            `Unexpected error: ${getErrorMessage(error)}`,
          ),
        );
      }
    }
  }

  return result;
}
