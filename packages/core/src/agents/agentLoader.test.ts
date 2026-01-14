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
import type { LocalAgentDefinition } from './types.js';

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

    it('should throw AgentLoadError if tools list includes forbidden tool', async () => {
      const filePath = await writeAgentMarkdown(`---
name: test-agent
description: Test
tools:
  - delegate_to_agent
---
Body`);
      await expect(parseAgentMarkdown(filePath)).rejects.toThrow(
        /tools list cannot include 'delegate_to_agent'/,
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
          maxTimeMinutes: 5,
        },
        inputConfig: {
          inputs: {
            query: {
              type: 'string',
              required: false,
            },
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
          inputs: {
            query: {
              type: 'string',
              description: 'The task for the agent.',
              required: false,
            },
          },
        },
      });
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
});
