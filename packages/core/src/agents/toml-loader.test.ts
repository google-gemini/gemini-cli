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
  parseAgentToml,
  tomlToAgentDefinition,
  loadAgentsFromDirectory,
  AgentLoadError,
} from './toml-loader.js';
import { GEMINI_MODEL_ALIAS_PRO } from '../config/models.js';
import type { LocalAgentDefinition } from './types.js';

describe('toml-loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  async function writeAgentToml(content: string, fileName = 'test.toml') {
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  describe('parseAgentToml', () => {
    it('should parse a valid MVA TOML file', async () => {
      const filePath = await writeAgentToml(`
        name = "test-agent"
        description = "A test agent"
        [prompts]
        system_prompt = "You are a test agent."
      `);

      const result = await parseAgentToml(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'test-agent',
        description: 'A test agent',
        prompts: {
          system_prompt: 'You are a test agent.',
        },
      });
    });

    it('should parse a valid remote agent TOML file', async () => {
      const filePath = await writeAgentToml(`
        kind = "remote"
        name = "remote-agent"
        description = "A remote agent"
        agent_card_url = "https://example.com/card"
      `);

      const result = await parseAgentToml(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'remote-agent',
        description: 'A remote agent',
        agent_card_url: 'https://example.com/card',
      });
    });

    it('should infer remote agent kind from agent_card_url', async () => {
      const filePath = await writeAgentToml(`
        name = "inferred-remote"
        description = "Inferred"
        agent_card_url = "https://example.com/inferred"
      `);

      const result = await parseAgentToml(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'inferred-remote',
        description: 'Inferred',
        agent_card_url: 'https://example.com/inferred',
      });
    });

    it('should parse a remote agent without description', async () => {
      const filePath = await writeAgentToml(`
        kind = "remote"
        name = "no-description-remote"
        agent_card_url = "https://example.com/card"
      `);

      const result = await parseAgentToml(filePath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        kind: 'remote',
        name: 'no-description-remote',
        agent_card_url: 'https://example.com/card',
      });
      expect(result[0].description).toBeUndefined();

      // defined after conversion to AgentDefinition
      const agentDef = tomlToAgentDefinition(result[0]);
      expect(agentDef.description).toBe('(Loading description...)');
    });

    it('should parse multiple agents in one file', async () => {
      const filePath = await writeAgentToml(`
        [[remote_agents]]
        kind = "remote"
        name = "agent-1"
        description = "Remote 1"
        agent_card_url = "https://example.com/1"

        [[remote_agents]]
        kind = "remote"
        name = "agent-2"
        description = "Remote 2"
        agent_card_url = "https://example.com/2"
      `);

      const result = await parseAgentToml(filePath);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('agent-1');
      expect(result[0].kind).toBe('remote');
      expect(result[1].name).toBe('agent-2');
      expect(result[1].kind).toBe('remote');
    });

    it('should allow omitting kind in remote_agents block', async () => {
      const filePath = await writeAgentToml(`
        [[remote_agents]]
        name = "implicit-remote-1"
        agent_card_url = "https://example.com/1"

        [[remote_agents]]
        name = "implicit-remote-2"
        agent_card_url = "https://example.com/2"
      `);

      const result = await parseAgentToml(filePath);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        kind: 'remote',
        name: 'implicit-remote-1',
        agent_card_url: 'https://example.com/1',
      });
      expect(result[1]).toMatchObject({
        kind: 'remote',
        name: 'implicit-remote-2',
        agent_card_url: 'https://example.com/2',
      });
    });

    it('should throw AgentLoadError if file reading fails', async () => {
      const filePath = path.join(tempDir, 'non-existent.toml');
      await expect(parseAgentToml(filePath)).rejects.toThrow(AgentLoadError);
    });

    it('should throw AgentLoadError if TOML parsing fails', async () => {
      const filePath = await writeAgentToml('invalid toml [');
      await expect(parseAgentToml(filePath)).rejects.toThrow(AgentLoadError);
    });

    it('should throw AgentLoadError if validation fails (missing required field)', async () => {
      const filePath = await writeAgentToml(`
        name = "test-agent"
        # missing description
        [prompts]
        system_prompt = "You are a test agent."
      `);
      await expect(parseAgentToml(filePath)).rejects.toThrow(
        /Validation failed/,
      );
    });

    it('should throw AgentLoadError if name is not a slug', async () => {
      const filePath = await writeAgentToml(`
        name = "Test Agent!"
        description = "A test agent"
        [prompts]
        system_prompt = "You are a test agent."
      `);
      await expect(parseAgentToml(filePath)).rejects.toThrow(
        /Name must be a valid slug/,
      );
    });

    it('should throw AgentLoadError if delegate_to_agent is included in tools', async () => {
      const filePath = await writeAgentToml(`
        name = "test-agent"
        description = "A test agent"
        tools = ["run_shell_command", "delegate_to_agent"]
        [prompts]
        system_prompt = "You are a test agent."
      `);

      await expect(parseAgentToml(filePath)).rejects.toThrow(
        /tools list cannot include 'delegate_to_agent'/,
      );
    });

    it('should throw AgentLoadError if tools contains invalid names', async () => {
      const filePath = await writeAgentToml(`
        name = "test-agent"
        description = "A test agent"
        tools = ["not-a-tool"]
        [prompts]
        system_prompt = "You are a test agent."
      `);
      await expect(parseAgentToml(filePath)).rejects.toThrow(
        /Validation failed:[\s\S]*tools.0: Invalid tool name/,
      );
    });

    it('should throw AgentLoadError if file contains both single and multiple agents', async () => {
      const filePath = await writeAgentToml(`
            name = "top-level-agent"
            description = "I should not be here"
            [prompts]
            system_prompt = "..."

            [[remote_agents]]
            kind = "remote"
            name = "array-agent"
            description = "I am in an array"
            agent_card_url = "https://example.com/card"
          `);

      await expect(parseAgentToml(filePath)).rejects.toThrow(
        /Validation failed/,
      );
    });

    it('should show both options in error message when validation fails ambiguously', async () => {
      const filePath = await writeAgentToml(`
        name = "ambiguous-agent"
        description = "I have neither prompts nor card"
      `);
      await expect(parseAgentToml(filePath)).rejects.toThrow(
        /Validation failed: Agent Definition:\n\(Local Agent\) prompts: Required\n\(Remote Agent\) agent_card_url: Required/,
      );
    });
  });

  describe('tomlToAgentDefinition', () => {
    it('should convert valid TOML to AgentDefinition with defaults', () => {
      const toml = {
        kind: 'local' as const,
        name: 'test-agent',
        description: 'A test agent',
        prompts: {
          system_prompt: 'You are a test agent.',
        },
      };

      const result = tomlToAgentDefinition(toml);
      expect(result).toMatchObject({
        name: 'test-agent',
        description: 'A test agent',
        promptConfig: {
          systemPrompt: 'You are a test agent.',
        },
        modelConfig: {
          model: 'inherit',
          top_p: 0.95,
        },
        runConfig: {
          max_time_minutes: 5,
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
      const toml = {
        kind: 'local' as const,
        name: 'test-agent',
        description: 'A test agent',
        model: {
          model: GEMINI_MODEL_ALIAS_PRO,
        },
        prompts: {
          system_prompt: 'You are a test agent.',
        },
      };

      const result = tomlToAgentDefinition(toml) as LocalAgentDefinition;
      expect(result.modelConfig.model).toBe(GEMINI_MODEL_ALIAS_PRO);
    });

    it('should pass through unknown model names (e.g. auto)', () => {
      const toml = {
        kind: 'local' as const,
        name: 'test-agent',
        description: 'A test agent',
        model: {
          model: 'auto',
        },
        prompts: {
          system_prompt: 'You are a test agent.',
        },
      };

      const result = tomlToAgentDefinition(toml) as LocalAgentDefinition;
      expect(result.modelConfig.model).toBe('auto');
    });
  });

  describe('loadAgentsFromDirectory', () => {
    it('should load definitions from a directory', async () => {
      await writeAgentToml(
        `
        name = "agent-1"
        description = "Agent 1"
        [prompts]
        system_prompt = "Prompt 1"
      `,
        'valid.toml',
      );

      // Create a non-TOML file
      await fs.writeFile(path.join(tempDir, 'other.txt'), 'content');

      // Create a hidden file
      await writeAgentToml(
        `
        name = "hidden"
        description = "Hidden"
        [prompts]
        system_prompt = "Hidden"
      `,
        '_hidden.toml',
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
      // Create a malformed TOML file
      await writeAgentToml('invalid toml [', 'malformed.toml');

      const result = await loadAgentsFromDirectory(tempDir);
      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });
  });
});
