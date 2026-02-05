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
import type { Config } from 'src/config/config.js';

describe('GeneralistAgent', () => {
  it('should create a valid generalist agent definition', async () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'getToolRegistry').mockReturnValue({
      getAllToolNames: () => ['tool1', 'tool2', 'agent-tool'],
      getTool: () => undefined,
      unregisterTool: () => {},
      registerTool: () => {},
    } as unknown as ToolRegistry);
    vi.spyOn(config, 'getGeminiClient').mockReturnValue({
      setTools: async () => {},
    } as unknown as ReturnType<Config['getGeminiClient']>);
    vi.spyOn(config, 'getAgentRegistry').mockReturnValue({
      getDirectoryContext: () => 'mock directory context',
      getAllAgentNames: () => ['agent-tool'],
    } as unknown as AgentRegistry);

    const agent = GeneralistAgent(config);

    expect(agent.name).toBe('generalist');
    expect(agent.kind).toBe('local');
    expect(agent.modelConfig.model).toBe('inherit');
    expect(agent.toolConfig?.tools).toBeDefined();
    expect(agent.toolConfig?.tools).toContain('agent-tool');
    expect(agent.toolConfig?.tools).toContain('tool1');

    const promptConfig = agent.promptConfig;
    const systemPrompt = await promptConfig.systemPrompt;
    expect(systemPrompt).toContain('CLI agent');
    // Ensure it's non-interactive
    expect(systemPrompt).toContain('non-interactive');
  });
});
