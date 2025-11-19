/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptRegistry } from './prompt-registry.js';
import type { DiscoveredMCPPrompt } from '../tools/mcp-client.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('PromptRegistry', () => {
  let registry: PromptRegistry;

  const prompt1: DiscoveredMCPPrompt = {
    name: 'prompt1',
    serverName: 'server1',
    invoke: async () => ({
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'response1' } },
      ],
    }),
  };

  const prompt2: DiscoveredMCPPrompt = {
    name: 'prompt2',
    serverName: 'server1',
    invoke: async () => ({
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'response2' } },
      ],
    }),
  };

  const prompt3: DiscoveredMCPPrompt = {
    name: 'prompt1',
    serverName: 'server2',
    invoke: async () => ({
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'response3' } },
      ],
    }),
  };

  beforeEach(() => {
    registry = new PromptRegistry();
    vi.clearAllMocks();
  });

  it('should register a prompt', () => {
    registry.registerPrompt(prompt1);
    expect(registry.getPrompt('prompt1')).toEqual(prompt1);
  });

  it('should get all prompts, sorted by name', () => {
    registry.registerPrompt(prompt2);
    registry.registerPrompt(prompt1);
    expect(registry.getAllPrompts()).toEqual([prompt1, prompt2]);
  });

  it('should get a specific prompt by name', () => {
    registry.registerPrompt(prompt1);
    expect(registry.getPrompt('prompt1')).toEqual(prompt1);
    expect(registry.getPrompt('non-existent')).toBeUndefined();
  });

  it('should get prompts by server, sorted by name', () => {
    registry.registerPrompt(prompt1);
    registry.registerPrompt(prompt2);
    registry.registerPrompt(prompt3); // different server
    expect(registry.getPromptsByServer('server1')).toEqual([prompt1, prompt2]);
    expect(registry.getPromptsByServer('server2')).toEqual([
      { ...prompt3, name: 'server2_prompt1' },
    ]);
  });

  it('should handle prompt name collision by renaming', () => {
    registry.registerPrompt(prompt1);
    registry.registerPrompt(prompt3);

    expect(registry.getPrompt('prompt1')).toEqual(prompt1);
    const renamedPrompt = { ...prompt3, name: 'server2_prompt1' };
    expect(registry.getPrompt('server2_prompt1')).toEqual(renamedPrompt);
    expect(debugLogger.warn).toHaveBeenCalledWith(
      'Prompt with name "prompt1" is already registered. Renaming to "server2_prompt1".',
    );
  });

  it('should clear all prompts', () => {
    registry.registerPrompt(prompt1);
    registry.registerPrompt(prompt2);
    registry.clear();
    expect(registry.getAllPrompts()).toEqual([]);
  });

  it('should remove prompts by server', () => {
    registry.registerPrompt(prompt1);
    registry.registerPrompt(prompt2);
    registry.registerPrompt(prompt3);
    registry.removePromptsByServer('server1');

    const renamedPrompt = { ...prompt3, name: 'server2_prompt1' };
    expect(registry.getAllPrompts()).toEqual([renamedPrompt]);
    expect(registry.getPrompt('prompt1')).toBeUndefined();
    expect(registry.getPrompt('prompt2')).toBeUndefined();
    expect(registry.getPrompt('server2_prompt1')).toEqual(renamedPrompt);
  });
});
