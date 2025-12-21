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
      expect(result).toEqual({
        name: 'test-agent',
        description: 'A test agent',
        prompts: {
          system_prompt: 'You are a test agent.',
        },
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
        /Validation failed: tools.0: Invalid tool name/,
      );
    });
  });

  describe('tomlToAgentDefinition', () => {
    it('should convert valid TOML to AgentDefinition with defaults', () => {
      const toml = {
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
