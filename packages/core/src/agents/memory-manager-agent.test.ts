/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryManagerAgent } from './memory-manager-agent.js';
import {
  ASK_USER_TOOL_NAME,
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { Storage } from '../config/storage.js';
import type { Config } from '../config/config.js';
import type { HierarchicalMemory } from '../config/memory.js';

function createMockConfig(memory: string | HierarchicalMemory = ''): Config {
  return {
    getUserMemory: vi.fn().mockReturnValue(memory),
  } as unknown as Config;
}

describe('MemoryManagerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct name "save_memory"', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    expect(agent.name).toBe('save_memory');
  });

  it('should be a local agent', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    expect(agent.kind).toBe('local');
  });

  it('should have a description', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    expect(agent.description).toBeTruthy();
    expect(agent.description).toContain('memory');
  });

  it('should have a system prompt with memory management instructions', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    const prompt = agent.promptConfig.systemPrompt;
    const globalGeminiDir = Storage.getGlobalGeminiDir();
    expect(prompt).toContain(`Global (${globalGeminiDir}`);
    expect(prompt).toContain('Project (./');
    expect(prompt).toContain('Memory Hierarchy');
    expect(prompt).toContain('De-duplicating');
    expect(prompt).toContain('Adding');
    expect(prompt).toContain('Removing stale entries');
    expect(prompt).toContain('Organizing');
    expect(prompt).toContain('Routing');
  });

  it('should have efficiency guidelines in the system prompt', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    const prompt = agent.promptConfig.systemPrompt;
    expect(prompt).toContain('Efficiency & Performance');
    expect(prompt).toContain('Use as few turns as possible');
    expect(prompt).toContain('Do not perform any exploration');
    expect(prompt).toContain('Be strategic with your thinking');
    expect(prompt).toContain('Context Awareness');
  });

  it('should inject hierarchical memory into initial context', () => {
    const config = createMockConfig({
      global:
        '--- Context from: ../../.gemini/GEMINI.md ---\nglobal context\n--- End of Context from: ../../.gemini/GEMINI.md ---',
      project:
        '--- Context from: .gemini/GEMINI.md ---\nproject context\n--- End of Context from: .gemini/GEMINI.md ---',
    });

    const agent = MemoryManagerAgent(config);
    const query = agent.promptConfig.query;

    expect(query).toContain('# Initial Context');
    expect(query).toContain('global context');
    expect(query).toContain('project context');
  });

  it('should inject flat string memory into initial context', () => {
    const config = createMockConfig('flat memory content');

    const agent = MemoryManagerAgent(config);
    const query = agent.promptConfig.query;

    expect(query).toContain('# Initial Context');
    expect(query).toContain('flat memory content');
  });

  it('should exclude extension memory from initial context', () => {
    const config = createMockConfig({
      global: 'global context',
      extension: 'extension context that should be excluded',
      project: 'project context',
    });

    const agent = MemoryManagerAgent(config);
    const query = agent.promptConfig.query;

    expect(query).toContain('global context');
    expect(query).toContain('project context');
    expect(query).not.toContain('extension context');
  });

  it('should not include initial context when memory is empty', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    const query = agent.promptConfig.query;

    expect(query).not.toContain('# Initial Context');
  });

  it('should have file-management and search tools', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    expect(agent.toolConfig).toBeDefined();
    expect(agent.toolConfig!.tools).toEqual(
      expect.arrayContaining([
        READ_FILE_TOOL_NAME,
        EDIT_TOOL_NAME,
        WRITE_FILE_TOOL_NAME,
        LS_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        ASK_USER_TOOL_NAME,
      ]),
    );
  });

  it('should require a "request" input parameter', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    const schema = agent.inputConfig.inputSchema as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema['properties']).toHaveProperty('request');
    expect(schema['required']).toContain('request');
  });

  it('should use a fast model', () => {
    const agent = MemoryManagerAgent(createMockConfig());
    expect(agent.modelConfig.model).toBe('flash');
  });
});
