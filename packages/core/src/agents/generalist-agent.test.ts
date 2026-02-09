/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GeneralistAgent } from './generalist-agent.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRegistry } from './registry.js';

describe('GeneralistAgent', () => {
  it('should create a valid generalist agent definition', () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'getToolRegistry').mockReturnValue({
      getAllToolNames: () => ['tool1', 'tool2', 'agent-tool'],
    } as unknown as ToolRegistry);
    vi.spyOn(config, 'getAgentRegistry').mockReturnValue({
      getDirectoryContext: () => 'mock directory context',
      getAllAgentNames: () => ['agent-tool'],
      getAllDefinitions: () => [],
    } as unknown as AgentRegistry);

    const agent = GeneralistAgent(config);

    expect(agent.name).toBe('generalist');
    expect(agent.kind).toBe('local');
    expect(agent.modelConfig.model).toBe('inherit');
    expect(agent.toolConfig?.tools).toBeDefined();
    expect(agent.toolConfig?.tools).toContain('agent-tool');
    expect(agent.toolConfig?.tools).toContain('tool1');
    expect(agent.promptConfig.systemPrompt).toContain('CLI agent');
    // Ensure it's non-interactive
    expect(agent.promptConfig.systemPrompt).toContain('non-interactive');
  });
});
