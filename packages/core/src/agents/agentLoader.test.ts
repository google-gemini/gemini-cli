/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseAgentMarkdown,
  markdownToAgentDefinition,
  loadAgentsFromDirectory,
  AgentLoadError,
} from './agentLoader.js';
import { GEMINI_MODEL_ALIAS_PRO } from '../config/models.js';
import {
  DEFAULT_MAX_TIME_MINUTES,
  DEFAULT_MAX_TURNS,
  type LocalAgentDefinition,
  type RemoteAgentDefinition,
  getAgentCardLoadOptions,
  getRemoteAgentTargetUrl,
} from './types.js';

describe('loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  async function writeAgentMarkdown(content: string, fileName = 'test.md') {
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  describe('parseAgentMarkdown', () => {
    it('should parse a valid markdown agent file', async () => {
      const filePath = await writeAgentMarkdown(`---
name: test-agent-md
description: A markdown agent
---
You are a markdown agent.`);

      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'test-agent-md',
        description: 'A markdown agent',
        kind: 'local',
        system_prompt: 'You are a markdown agent.',
      });
    });

    it('should parse frontmatter with tools and model config', async () => {
      const filePath = await writeAgentMarkdown(`---
name: complex-agent
description: A complex markdown agent
tools:
  - run_shell_command
model: gemini-pro
temperature: 0.7
---
System prompt content.`);

      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'complex-agent',
        description: 'A complex markdown agent',
        tools: ['run_shell_command'],
        model: 'gemini-pro',
        temperature: 0.7,
        system_prompt: 'System prompt content.',
      });
    });

    it('should parse frontmatter with mcp_servers', async () => {
      const filePath = await writeAgentMarkdown(`---
name: mcp-agent
description: An agent with MCP servers
mcp_servers:
  test-server:
    command: node
    args: [server.js]
    include_tools: [tool1, tool2]
---
System prompt content.`);

      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'mcp-agent',
        description: 'An agent with MCP servers',
        mcp_servers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            include_tools: ['tool1', 'tool2'],
          },
        },
      });
    });

    it('should throw AgentLoadError if frontmatter is missing', async () => {
      const filePath = await writeAgentMarkdown(`Just some markdown content.`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        AgentLoadError,
      );
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        'Missing mandatory YAML frontmatter',
      );
    });

    it('should throw AgentLoadError if frontmatter is invalid YAML', async () => {
      const filePath = await writeAgentMarkdown(`---
name: [invalid yaml
---
Body`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        AgentLoadError,
      );
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        'YAML frontmatter parsing failed',
      );
    });

    it('should throw AgentLoadError if validation fails (missing required field)', async () => {
      const filePath = await writeAgentMarkdown(`---
name: test-agent
# missing description
---
Body`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /Validation failed/,
      );
    });

    it('should parse a valid remote agent markdown file', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: remote-agent
description: A remote agent
agent_card_url: https://example.com/card
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'remote-agent',
        description: 'A remote agent',
        agent_card_url: 'https://example.com/card',
      });
    });

    it('should infer remote agent kind from agent_card_url', async () => {
      const filePath = await writeAgentMarkdown(`---
name: inferred-remote
description: Inferred
agent_card_url: https://example.com/inferred
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'inferred-remote',
        description: 'Inferred',
        agent_card_url: 'https://example.com/inferred',
      });
    });

    it('should parse a remote agent with no body', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: no-body-remote
agent_card_url: https://example.com/card
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'no-body-remote',
        agent_card_url: 'https://example.com/card',
      });
    });

    it('should parse multiple remote agents in a list', async () => {
      const filePath = await writeAgentMarkdown(`---
- kind: remote
  name: remote-1
  agent_card_url: https://example.com/1
- kind: remote
  name: remote-2
  agent_card_url: https://example.com/2
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'remote-1',
        agent_card_url: 'https://example.com/1',
      });
      expect(result[1]).toEqual({
        kind: 'remote',
        name: 'remote-2',
        agent_card_url: 'https://example.com/2',
      });
    });

    it('should parse frontmatter without a trailing newline', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: no-trailing-newline
agent_card_url: https://example.com/card
---`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'no-trailing-newline',
        agent_card_url: 'https://example.com/card',
      });
    });

    it('should parse a remote agent with agent_card_json', async () => {
      const cardJson = JSON.stringify({
        name: 'json-agent',
        url: 'https://example.com/agent',
        version: '1.0',
      });
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: json-remote
description: A JSON-based remote agent
agent_card_json: '${cardJson}'
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'json-remote',
        description: 'A JSON-based remote agent',
        agent_card_json: cardJson,
      });
      // Should NOT have agent_card_url
      expect(result[0]).not.toHaveProperty('agent_card_url');
    });

    it('should reject agent_card_json that is not valid JSON', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-json-remote
agent_card_json: "not valid json {{"
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /agent_card_json must be valid JSON/,
      );
    });

    it('should reject a remote agent with both agent_card_url and agent_card_json', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: both-fields
agent_card_url: https://example.com/card
agent_card_json: '{"name":"test"}'
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /Validation failed/,
      );
    });

    it('should infer remote kind from agent_card_json', async () => {
      const cardJson = JSON.stringify({
        name: 'test',
        url: 'https://example.com',
      });
      const filePath = await writeAgentMarkdown(`---
name: inferred-json-remote
agent_card_json: '${cardJson}'
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'inferred-json-remote',
        agent_card_json: cardJson,
      });
    });

    it('should throw AgentLoadError if agent name is not a valid slug', async () => {
      const filePath = await writeAgentMarkdown(`---
name: Invalid Name With Spaces
description: Test
---
Body`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /Name must be a valid slug/,
      );
    });

    describe('error formatting and kind inference', () => {
      it('should only show local agent errors when kind is inferred as local (via kind field)', async () => {
        const filePath = await writeAgentMarkdown(`---
kind: local
name: invalid-local
# missing description
---
Body`);
        const error = await parseAgentMarkdown(filePath).catch((e) => e);
        expect(error).toBeInstanceOf(AgentLoadError);
        expect(error.message).toContain('Validation failed');
        expect(error.message).toContain('description: Required');
        expect(error.message).not.toContain('Remote Agent');
      });

      it('should only show local agent errors when kind is inferred as local (via local-specific keys)', async () => {
        const filePath = await writeAgentMarkdown(`---
name: invalid-local
# missing description
tools:
  - run_shell_command
---
Body`);
        const error = await parseAgentMarkdown(filePath).catch((e) => e);
        expect(error).toBeInstanceOf(AgentLoadError);
        expect(error.message).toContain('Validation failed');
        expect(error.message).toContain('description: Required');
        expect(error.message).not.toContain('Remote Agent');
      });

      it('should only show remote agent errors when kind is inferred as remote (via kind field)', async () => {
        const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-remote
# missing agent_card_url
---
Body`);
        const error = await parseAgentMarkdown(filePath).catch((e) => e);
        expect(error).toBeInstanceOf(AgentLoadError);
        expect(error.message).toContain('Validation failed');
        expect(error.message).toContain('agent_card_url: Required');
        expect(error.message).not.toContain('Local Agent');
      });

      it('should only show remote agent errors when kind is inferred as remote (via remote-specific keys)', async () => {
        const filePath = await writeAgentMarkdown(`---
name: invalid-remote
auth:
  type: apiKey
  key: my_key
# missing agent_card_url
---
Body`);
        const error = await parseAgentMarkdown(filePath).catch((e) => e);
        expect(error).toBeInstanceOf(AgentLoadError);
        expect(error.message).toContain('Validation failed');
        expect(error.message).toContain('agent_card_url: Required');
        expect(error.message).not.toContain('Local Agent');
      });

      it('should show errors for both types when kind cannot be inferred', async () => {
        const filePath = await writeAgentMarkdown(`---
name: invalid-unknown
# missing description and missing agent_card_url, no specific keys
---
Body`);
        const error = await parseAgentMarkdown(filePath).catch((e) => e);
        expect(error).toBeInstanceOf(AgentLoadError);
        expect(error.message).toContain('Validation failed');
        expect(error.message).toContain('(Local Agent)');
        expect(error.message).toContain('(Remote Agent)');
        expect(error.message).toContain('description: Required');
        expect(error.message).toContain('agent_card_url: Required');
      });

      it('should format errors without a stray colon when the path is empty (e.g. strict object with unknown keys)', async () => {
        const filePath = await writeAgentMarkdown(`---
kind: local
name: my-agent
description: test
unknown_field: true
---
Body`);
        const error = await parseAgentMarkdown(filePath).catch((e) => e);
        expect(error).toBeInstanceOf(AgentLoadError);
        expect(error.message).toContain(
          "Unrecognized key(s) in object: 'unknown_field'",
        );
        expect(error.message).not.toContain(': Unrecognized key(s)');
        expect(error.message).not.toContain('Required');
      });
    });
  });

  describe('markdownToAgentDefinition', () => {
    it('should convert valid Markdown DTO to AgentDefinition with defaults', () => {
      const markdown = {
        kind: 'local' as const,
        name: 'test-agent',
        description: 'A test agent',
        system_prompt: 'You are a test agent.',
      };

      const result = markdownToAgentDefinition(markdown);
      expect(result).toMatchObject({
        name: 'test-agent',
        description: 'A test agent',
        promptConfig: {
          systemPrompt: 'You are a test agent.',
          query: '${query}',
        },
        modelConfig: {
          model: 'inherit',
          generateContentConfig: {
            topP: 0.95,
          },
        },
        runConfig: {
          maxTimeMinutes: DEFAULT_MAX_TIME_MINUTES,
          maxTurns: DEFAULT_MAX_TURNS,
        },
        inputConfig: {
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The task for the agent.',
              },
            },
            required: [],
          },
        },
      });
    });

    it('should pass through model aliases', () => {
      const markdown = {
        kind: 'local' as const,
        name: 'test-agent',
        description: 'A test agent',
        model: GEMINI_MODEL_ALIAS_PRO,
        system_prompt: 'You are a test agent.',
      };

      const result = markdownToAgentDefinition(
        markdown,
      ) as LocalAgentDefinition;
      expect(result.modelConfig.model).toBe(GEMINI_MODEL_ALIAS_PRO);
    });

    it('should convert mcp_servers in local agent', () => {
      const markdown = {
        kind: 'local' as const,
        name: 'mcp-agent',
        description: 'An agent with MCP servers',
        mcp_servers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            include_tools: ['tool1'],
          },
        },
        system_prompt: 'prompt',
      };

      const result = markdownToAgentDefinition(
        markdown,
      ) as LocalAgentDefinition;
      expect(result.kind).toBe('local');
      expect(result.mcpServers).toBeDefined();
      expect(result.mcpServers!['test-server']).toMatchObject({
        command: 'node',
        args: ['server.js'],
        includeTools: ['tool1'],
      });
    });

    it('should pass through unknown model names (e.g. auto)', () => {
      const markdown = {
        kind: 'local' as const,
        name: 'test-agent',
        description: 'A test agent',
        model: 'auto',
        system_prompt: 'You are a test agent.',
      };

      const result = markdownToAgentDefinition(
        markdown,
      ) as LocalAgentDefinition;
      expect(result.modelConfig.model).toBe('auto');
    });

    it('should convert remote agent definition', () => {
      const markdown = {
        kind: 'remote' as const,
        name: 'remote-agent',
        description: 'A remote agent',
        agent_card_url: 'https://example.com/card',
      };

      const result = markdownToAgentDefinition(markdown);
      expect(result).toEqual({
        kind: 'remote',
        name: 'remote-agent',
        description: 'A remote agent',
        displayName: undefined,
        agentCardUrl: 'https://example.com/card',
        inputConfig: {
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The task for the agent.',
              },
            },
            required: [],
          },
        },
      });
    });

    it('should convert remote agent definition with agent_card_json', () => {
      const cardJson = JSON.stringify({
        name: 'json-agent',
        url: 'https://example.com/agent',
      });
      const markdown = {
        kind: 'remote' as const,
        name: 'json-remote',
        description: 'A JSON remote agent',
        agent_card_json: cardJson,
      };

      const result = markdownToAgentDefinition(
        markdown,
      ) as RemoteAgentDefinition;
      expect(result.kind).toBe('remote');
      expect(result.name).toBe('json-remote');
      expect(result.agentCardJson).toBe(cardJson);
      expect(result.agentCardUrl).toBeUndefined();
    });

    it('should throw for remote agent with neither agent_card_url nor agent_card_json', () => {
      // Cast to bypass compile-time check — this tests the runtime guard
      const markdown = {
        kind: 'remote' as const,
        name: 'no-card-agent',
        description: 'Missing card info',
      } as Parameters<typeof markdownToAgentDefinition>[0];

      expect(() => markdownToAgentDefinition(markdown)).toThrow(
        /neither agent_card_json nor agent_card_url/,
      );
    });
  });

  describe('loadAgentsFromDirectory', () => {
    it('should load definitions from a directory (Markdown only)', async () => {
      await writeAgentMarkdown(
        `---
name: agent-1
description: Agent 1
---
Prompt 1`,
        'valid.md',
      );

      // Create a non-supported file
      await fs.writeFile(path.join(tempDir, 'other.txt'), 'content');

      // Create a hidden file
      await writeAgentMarkdown(
        `---
name: hidden
description: Hidden
---
Hidden`,
        '_hidden.md',
      );

      const result = await loadAgentsFromDirectory(tempDir);
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('agent-1');
      expect(result.errors).toHaveLength(0);
    });

    it('should return empty result if directory does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      const result = await loadAgentsFromDirectory(nonExistentDir);
      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors for malformed individual files', async () => {
      // Create a malformed Markdown file
      await writeAgentMarkdown('invalid markdown', 'malformed.md');

      const result = await loadAgentsFromDirectory(tempDir);
      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('remote agent auth configuration', () => {
    it('should parse remote agent with apiKey auth', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: api-key-agent
agent_card_url: https://example.com/card
auth:
  type: apiKey
  key: $MY_API_KEY
  name: X-Custom-Key
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'api-key-agent',
        auth: {
          type: 'apiKey',
          key: '$MY_API_KEY',
          name: 'X-Custom-Key',
        },
      });
    });

    it('should parse remote agent with http Bearer auth', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: bearer-agent
agent_card_url: https://example.com/card
auth:
  type: http
  scheme: Bearer
  token: $BEARER_TOKEN
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'bearer-agent',
        auth: {
          type: 'http',
          scheme: 'Bearer',
          token: '$BEARER_TOKEN',
        },
      });
    });

    it('should parse remote agent with http Basic auth', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: basic-agent
agent_card_url: https://example.com/card
auth:
  type: http
  scheme: Basic
  username: $AUTH_USER
  password: $AUTH_PASS
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'basic-agent',
        auth: {
          type: 'http',
          scheme: 'Basic',
          username: '$AUTH_USER',
          password: '$AUTH_PASS',
        },
      });
    });

    it('should parse remote agent with Digest via raw value', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: digest-agent
agent_card_url: https://example.com/card
auth:
  type: http
  scheme: Digest
  value: username="admin", response="abc123"
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'digest-agent',
        auth: {
          type: 'http',
          scheme: 'Digest',
          value: 'username="admin", response="abc123"',
        },
      });
    });

    it('should parse remote agent with generic raw auth value', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: raw-agent
agent_card_url: https://example.com/card
auth:
  type: http
  scheme: CustomScheme
  value: raw-token-value
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'raw-agent',
        auth: {
          type: 'http',
          scheme: 'CustomScheme',
          value: 'raw-token-value',
        },
      });
    });

    it('should throw error for Bearer auth without token', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-bearer
agent_card_url: https://example.com/card
auth:
  type: http
  scheme: Bearer
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /Bearer scheme requires "token"/,
      );
    });

    it('should throw error for Basic auth without credentials', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-basic
agent_card_url: https://example.com/card
auth:
  type: http
  scheme: Basic
  username: user
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /Basic authentication requires "password"/,
      );
    });

    it('should throw error for apiKey auth without key', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-apikey
agent_card_url: https://example.com/card
auth:
  type: apiKey
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /auth\.key.*Required/,
      );
    });

    it('should convert auth config in markdownToAgentDefinition', () => {
      const markdown = {
        kind: 'remote' as const,
        name: 'auth-agent',
        agent_card_url: 'https://example.com/card',
        auth: {
          type: 'apiKey' as const,
          key: '$API_KEY',
        },
      };

      const result = markdownToAgentDefinition(markdown);
      expect(result).toMatchObject({
        kind: 'remote',
        name: 'auth-agent',
        auth: {
          type: 'apiKey',
          key: '$API_KEY',
        },
      });
    });

    it('should parse remote agent with oauth2 auth', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: oauth2-agent
agent_card_url: https://example.com/card
auth:
  type: oauth
  client_id: $MY_OAUTH_CLIENT_ID
  scopes:
    - read
    - write
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'oauth2-agent',
        auth: {
          type: 'oauth',
          client_id: '$MY_OAUTH_CLIENT_ID',
          scopes: ['read', 'write'],
        },
      });
    });

    it('should parse remote agent with oauth2 auth including all fields', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: oauth2-full-agent
agent_card_url: https://example.com/card
auth:
  type: oauth
  client_id: my-client-id
  client_secret: my-client-secret
  scopes:
    - openid
    - profile
  authorization_url: https://auth.example.com/authorize
  token_url: https://auth.example.com/token
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'oauth2-full-agent',
        auth: {
          type: 'oauth',
          client_id: 'my-client-id',
          client_secret: 'my-client-secret',
          scopes: ['openid', 'profile'],
          authorization_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
        },
      });
    });

    it('should parse remote agent with minimal oauth2 config (type only)', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: oauth2-minimal-agent
agent_card_url: https://example.com/card
auth:
  type: oauth
---
`);
      const result = await parseAgentMarkdown(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'oauth2-minimal-agent',
        auth: {
          type: 'oauth',
        },
      });
    });

    it('should reject oauth2 auth with invalid authorization_url', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-oauth2-agent
agent_card_url: https://example.com/card
auth:
  type: oauth
  client_id: my-client
  authorization_url: not-a-valid-url
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(/Invalid url/);
    });

    it('should reject oauth2 auth with invalid token_url', async () => {
      const filePath = await writeAgentMarkdown(`---
kind: remote
name: invalid-oauth2-agent
agent_card_url: https://example.com/card
auth:
  type: oauth
  client_id: my-client
  token_url: not-a-valid-url
---
`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(/Invalid url/);
    });

    it('should convert oauth2 auth config in markdownToAgentDefinition', () => {
      const markdown = {
        kind: 'remote' as const,
        name: 'oauth2-convert-agent',
        agent_card_url: 'https://example.com/card',
        auth: {
          type: 'oauth' as const,
          client_id: '$MY_CLIENT_ID',
          scopes: ['read'],
          authorization_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
        },
      };

      const result = markdownToAgentDefinition(markdown);
      expect(result).toMatchObject({
        kind: 'remote',
        name: 'oauth2-convert-agent',
        auth: {
          type: 'oauth2',
          client_id: '$MY_CLIENT_ID',
          scopes: ['read'],
          authorization_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
        },
      });
    });

    it('should throw an error for an unknown auth type in markdownToAgentDefinition', () => {
      const markdown = {
        kind: 'remote' as const,
        name: 'unknown-auth-agent',
        agent_card_url: 'https://example.com/card',
        auth: {
          type: 'apiKey' as const,
          key: 'some-key',
        },
      };

      // Mutate the object at runtime to bypass TypeScript compile-time checks cleanly
      Object.assign(markdown.auth, { type: 'some-unknown-type' });

      expect(() => markdownToAgentDefinition(markdown)).toThrow(
        /Unknown auth type: some-unknown-type/,
      );
    });
  });

  describe('getAgentCardLoadOptions', () => {
    it('should return json options when agentCardJson is present', () => {
      const def = {
        name: 'test',
        agentCardJson: '{"url":"http://x"}',
      } as RemoteAgentDefinition;
      const opts = getAgentCardLoadOptions(def);
      expect(opts).toEqual({ type: 'json', json: '{"url":"http://x"}' });
    });

    it('should return url options when agentCardUrl is present', () => {
      const def = {
        name: 'test',
        agentCardUrl: 'http://x/card',
      } as RemoteAgentDefinition;
      const opts = getAgentCardLoadOptions(def);
      expect(opts).toEqual({ type: 'url', url: 'http://x/card' });
    });

    it('should prefer agentCardJson over agentCardUrl when both present', () => {
      const def = {
        name: 'test',
        agentCardJson: '{"url":"http://x"}',
        agentCardUrl: 'http://x/card',
      } as RemoteAgentDefinition;
      const opts = getAgentCardLoadOptions(def);
      expect(opts.type).toBe('json');
    });

    it('should throw when neither is present', () => {
      const def = { name: 'orphan' } as RemoteAgentDefinition;
      expect(() => getAgentCardLoadOptions(def)).toThrow(
        /Remote agent 'orphan' has neither agentCardUrl nor agentCardJson/,
      );
    });
  });

  describe('getRemoteAgentTargetUrl', () => {
    it('should return agentCardUrl when present', () => {
      const def = {
        name: 'test',
        agentCardUrl: 'http://x/card',
      } as RemoteAgentDefinition;
      expect(getRemoteAgentTargetUrl(def)).toBe('http://x/card');
    });

    it('should extract url from agentCardJson when agentCardUrl is absent', () => {
      const def = {
        name: 'test',
        agentCardJson: JSON.stringify({
          name: 'agent',
          url: 'https://example.com/agent',
        }),
      } as RemoteAgentDefinition;
      expect(getRemoteAgentTargetUrl(def)).toBe('https://example.com/agent');
    });

    it('should return undefined when JSON has no url field', () => {
      const def = {
        name: 'test',
        agentCardJson: JSON.stringify({ name: 'agent' }),
      } as RemoteAgentDefinition;
      expect(getRemoteAgentTargetUrl(def)).toBeUndefined();
    });

    it('should return undefined when agentCardJson is invalid JSON', () => {
      const def = {
        name: 'test',
        agentCardJson: 'not json',
      } as RemoteAgentDefinition;
      expect(getRemoteAgentTargetUrl(def)).toBeUndefined();
    });

    it('should return undefined when neither field is present', () => {
      const def = { name: 'test' } as RemoteAgentDefinition;
      expect(getRemoteAgentTargetUrl(def)).toBeUndefined();
    });
  });
});
