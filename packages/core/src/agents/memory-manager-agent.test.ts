/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { MemoryManagerAgent } from './memory-manager-agent.js';

describe('MemoryManagerAgent', () => {
  it('should have the correct name "save_memory"', () => {
    const agent = MemoryManagerAgent();
    expect(agent.name).toBe('save_memory');
  });

  it('should be a local agent', () => {
    const agent = MemoryManagerAgent();
    expect(agent.kind).toBe('local');
  });

  it('should have a description', () => {
    const agent = MemoryManagerAgent();
    expect(agent.description).toBeTruthy();
    expect(agent.description).toContain('memory');
  });

  it('should have a system prompt with memory management instructions', () => {
    const agent = MemoryManagerAgent();
    const prompt = agent.promptConfig.systemPrompt;
    expect(prompt).toContain('Global (~/.gemini/)');
    expect(prompt).toContain('Project (.gemini/)');
    expect(prompt).toContain('Table of Contents');
    expect(prompt).toContain('De-duplicating');
    expect(prompt).toContain('Adding');
    expect(prompt).toContain('Removing stale');
    expect(prompt).toContain('Organizing');
    expect(prompt).toContain('Routing');
  });

  it('should have file-management and search tools', () => {
    const agent = MemoryManagerAgent();
    expect(agent.toolConfig).toBeDefined();
    expect(agent.toolConfig!.tools).toEqual(
      expect.arrayContaining([
        'read_file',
        'replace',
        'write_file',
        'grep_search',
      ]),
    );
  });

  it('should require a "request" input parameter', () => {
    const agent = MemoryManagerAgent();
    const schema = agent.inputConfig.inputSchema as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema['properties']).toHaveProperty('request');
    expect(schema['required']).toContain('request');
  });

  it('should inherit the model from the parent agent', () => {
    const agent = MemoryManagerAgent();
    expect(agent.modelConfig.model).toBe('inherit');
  });
});
