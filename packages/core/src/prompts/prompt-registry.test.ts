/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PromptRegistry } from './prompt-registry.js';
import type { DiscoveredMCPPrompt } from '../tools/mcp-client.js';

describe('PromptRegistry', () => {
  let registry: PromptRegistry;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registry = new PromptRegistry();
    consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create empty registry', () => {
      expect(registry).toBeDefined();
      expect(registry.getAllPrompts()).toEqual([]);
    });
  });

  describe('registerPrompt', () => {
    it('should register a single prompt', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'test-prompt',
        description: 'Test prompt',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt);

      const prompts = registry.getAllPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toEqual(prompt);
    });

    it('should register multiple prompts', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        description: 'First prompt',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        description: 'Second prompt',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      expect(registry.getAllPrompts()).toHaveLength(2);
    });

    it('should rename duplicate prompt names', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        description: 'First prompt',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        description: 'Second prompt',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      const prompts = registry.getAllPrompts();
      expect(prompts).toHaveLength(2);
      expect(prompts[0]?.name).toBe('duplicate');
      expect(prompts[1]?.name).toBe('server-2_duplicate');
    });

    it('should warn when renaming duplicate', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        description: 'First prompt',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        description: 'Second prompt',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Prompt with name "duplicate" is already registered. Renaming to "server-2_duplicate".',
      );
    });

    it('should preserve prompt properties when renaming', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        description: 'First prompt',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        description: 'Second prompt',
        serverName: 'server-2',
        invoke: vi.fn(),
        arguments: [
          { name: 'arg1', description: 'Argument 1', required: true },
        ],
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      const renamedPrompt = registry.getPrompt('server-2_duplicate');
      expect(renamedPrompt?.description).toBe('Second prompt');
      expect(renamedPrompt?.serverName).toBe('server-2');
      expect(renamedPrompt?.arguments).toEqual([
        { name: 'arg1', description: 'Argument 1', required: true },
      ]);
    });

    it('should handle prompts with arguments', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'prompt-with-args',
        description: 'Prompt with arguments',
        serverName: 'test-server',
        invoke: vi.fn(),
        arguments: [
          { name: 'arg1', description: 'First argument', required: true },
          { name: 'arg2', description: 'Second argument', required: false },
        ],
      };

      registry.registerPrompt(prompt);

      const retrieved = registry.getPrompt('prompt-with-args');
      expect(retrieved?.arguments).toHaveLength(2);
    });
  });

  describe('getAllPrompts', () => {
    it('should return empty array for new registry', () => {
      expect(registry.getAllPrompts()).toEqual([]);
    });

    it('should return all registered prompts', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      expect(registry.getAllPrompts()).toHaveLength(2);
    });

    it('should return prompts sorted alphabetically by name', () => {
      const promptC: DiscoveredMCPPrompt = {
        name: 'c-prompt',
        serverName: 'server',
        invoke: vi.fn(),
      };

      const promptA: DiscoveredMCPPrompt = {
        name: 'a-prompt',
        serverName: 'server',
        invoke: vi.fn(),
      };

      const promptB: DiscoveredMCPPrompt = {
        name: 'b-prompt',
        serverName: 'server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(promptC);
      registry.registerPrompt(promptA);
      registry.registerPrompt(promptB);

      const prompts = registry.getAllPrompts();
      expect(prompts[0]?.name).toBe('a-prompt');
      expect(prompts[1]?.name).toBe('b-prompt');
      expect(prompts[2]?.name).toBe('c-prompt');
    });

    it('should return new array on each call', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'test',
        serverName: 'server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt);

      const prompts1 = registry.getAllPrompts();
      const prompts2 = registry.getAllPrompts();

      expect(prompts1).not.toBe(prompts2);
      expect(prompts1).toEqual(prompts2);
    });
  });

  describe('getPrompt', () => {
    it('should return prompt by name', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'test-prompt',
        description: 'Test prompt',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt);

      const retrieved = registry.getPrompt('test-prompt');
      expect(retrieved).toEqual(prompt);
    });

    it('should return undefined for non-existent prompt', () => {
      const retrieved = registry.getPrompt('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for empty registry', () => {
      const retrieved = registry.getPrompt('any-name');
      expect(retrieved).toBeUndefined();
    });

    it('should return renamed prompt by new name', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      const retrieved = registry.getPrompt('server-2_duplicate');
      expect(retrieved?.serverName).toBe('server-2');
    });

    it('should not return renamed prompt by original name', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      const retrieved = registry.getPrompt('duplicate');
      expect(retrieved?.serverName).toBe('server-1');
    });
  });

  describe('getPromptsByServer', () => {
    it('should return prompts from specific server', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server-b',
        invoke: vi.fn(),
      };

      const prompt3: DiscoveredMCPPrompt = {
        name: 'prompt-3',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);
      registry.registerPrompt(prompt3);

      const serverAPrompts = registry.getPromptsByServer('server-a');
      expect(serverAPrompts).toHaveLength(2);
      expect(serverAPrompts[0]?.name).toBe('prompt-1');
      expect(serverAPrompts[1]?.name).toBe('prompt-3');
    });

    it('should return empty array for non-existent server', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'prompt',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt);

      const prompts = registry.getPromptsByServer('non-existent');
      expect(prompts).toEqual([]);
    });

    it('should return empty array for empty registry', () => {
      const prompts = registry.getPromptsByServer('any-server');
      expect(prompts).toEqual([]);
    });

    it('should return prompts sorted alphabetically', () => {
      const promptC: DiscoveredMCPPrompt = {
        name: 'c-prompt',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      const promptA: DiscoveredMCPPrompt = {
        name: 'a-prompt',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      const promptB: DiscoveredMCPPrompt = {
        name: 'b-prompt',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(promptC);
      registry.registerPrompt(promptA);
      registry.registerPrompt(promptB);

      const prompts = registry.getPromptsByServer('test-server');
      expect(prompts[0]?.name).toBe('a-prompt');
      expect(prompts[1]?.name).toBe('b-prompt');
      expect(prompts[2]?.name).toBe('c-prompt');
    });

    it('should not include renamed prompts in original server count', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      const server1Prompts = registry.getPromptsByServer('server-1');
      expect(server1Prompts).toHaveLength(1);
    });

    it('should include renamed prompts with updated serverName', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      const server2Prompts = registry.getPromptsByServer('server-2');
      expect(server2Prompts).toHaveLength(1);
      expect(server2Prompts[0]?.name).toBe('server-2_duplicate');
    });
  });

  describe('clear', () => {
    it('should remove all prompts', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      registry.clear();

      expect(registry.getAllPrompts()).toEqual([]);
    });

    it('should allow registration after clear', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.clear();
      registry.registerPrompt(prompt2);

      const prompts = registry.getAllPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.name).toBe('prompt-2');
    });

    it('should handle clear on empty registry', () => {
      registry.clear();
      expect(registry.getAllPrompts()).toEqual([]);
    });

    it('should handle multiple clear calls', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'prompt',
        serverName: 'server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt);
      registry.clear();
      registry.clear();

      expect(registry.getAllPrompts()).toEqual([]);
    });
  });

  describe('removePromptsByServer', () => {
    it('should remove prompts from specific server', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server-b',
        invoke: vi.fn(),
      };

      const prompt3: DiscoveredMCPPrompt = {
        name: 'prompt-3',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);
      registry.registerPrompt(prompt3);

      registry.removePromptsByServer('server-a');

      const remaining = registry.getAllPrompts();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.name).toBe('prompt-2');
    });

    it('should remove all prompts from server', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'test-server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      registry.removePromptsByServer('test-server');

      expect(registry.getAllPrompts()).toEqual([]);
    });

    it('should not affect other servers', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server-b',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      registry.removePromptsByServer('server-a');

      expect(registry.getPromptsByServer('server-b')).toHaveLength(1);
    });

    it('should handle non-existent server', () => {
      const prompt: DiscoveredMCPPrompt = {
        name: 'prompt',
        serverName: 'server-a',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt);

      registry.removePromptsByServer('non-existent');

      expect(registry.getAllPrompts()).toHaveLength(1);
    });

    it('should handle empty registry', () => {
      registry.removePromptsByServer('any-server');
      expect(registry.getAllPrompts()).toEqual([]);
    });

    it('should remove renamed prompts', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'duplicate',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);

      registry.removePromptsByServer('server-2');

      const remaining = registry.getAllPrompts();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.serverName).toBe('server-1');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex registration and retrieval flow', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'analyze',
        description: 'Analyze data',
        serverName: 'analytics-server',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'format',
        description: 'Format output',
        serverName: 'formatter-server',
        invoke: vi.fn(),
      };

      const prompt3: DiscoveredMCPPrompt = {
        name: 'analyze',
        description: 'Different analysis',
        serverName: 'ml-server',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);
      registry.registerPrompt(prompt3);

      expect(registry.getAllPrompts()).toHaveLength(3);
      expect(registry.getPrompt('analyze')?.serverName).toBe(
        'analytics-server',
      );
      expect(registry.getPrompt('ml-server_analyze')?.serverName).toBe(
        'ml-server',
      );
      expect(registry.getPromptsByServer('analytics-server')).toHaveLength(1);
    });

    it('should maintain consistency after multiple operations', () => {
      const prompt1: DiscoveredMCPPrompt = {
        name: 'prompt-1',
        serverName: 'server-1',
        invoke: vi.fn(),
      };

      const prompt2: DiscoveredMCPPrompt = {
        name: 'prompt-2',
        serverName: 'server-2',
        invoke: vi.fn(),
      };

      registry.registerPrompt(prompt1);
      registry.registerPrompt(prompt2);
      registry.removePromptsByServer('server-1');
      registry.clear();
      registry.registerPrompt(prompt1);

      expect(registry.getAllPrompts()).toHaveLength(1);
      expect(registry.getPrompt('prompt-1')).toBeDefined();
    });
  });
});
