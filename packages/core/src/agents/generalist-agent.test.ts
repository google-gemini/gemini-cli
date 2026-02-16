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
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { GENERALIST_TOOL_NAME } from '../tools/tool-names.js';

describe('GeneralistAgent', () => {
  it('should create a valid generalist agent definition', () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'getToolRegistry').mockReturnValue({
      getAllToolNames: () => ['tool1', 'tool2', 'agent-tool'],
      getAllTools: () => [
        { name: 'tool1' },
        { name: 'tool2' },
        { name: 'agent-tool' },
      ],
    } as unknown as ToolRegistry);
    vi.spyOn(config, 'getAgentRegistry').mockReturnValue({
      getDirectoryContext: () => 'mock directory context',
      getAllAgentNames: () => ['agent-tool'],
      getAllDefinitions: () => [],
    } as unknown as AgentRegistry);

    const agent = GeneralistAgent(config);

    expect(agent.name).toBe(GENERALIST_TOOL_NAME);
    expect(agent.kind).toBe('local');
    expect(agent.modelConfig.model).toBe('inherit');
    expect(agent.toolConfig?.tools).toBeDefined();
    expect(agent.toolConfig?.tools).toContain('agent-tool');
    expect(agent.toolConfig?.tools).toContain('tool1');
    expect(agent.promptConfig.systemPrompt).toContain('CLI agent');
    // Ensure it's non-interactive
    expect(agent.promptConfig.systemPrompt).toContain('non-interactive');
  });

  it('should use fully qualified names for MCP tools', () => {
    const config = makeFakeConfig();
    const mockMcpTool = Object.create(DiscoveredMCPTool.prototype);
    mockMcpTool.getFullyQualifiedName = () => 'server__tool';
    mockMcpTool.name = 'tool';

    vi.spyOn(config, 'getToolRegistry').mockReturnValue({
      getAllTools: () => [{ name: 'normal-tool' }, mockMcpTool],
    } as unknown as ToolRegistry);

    const agent = GeneralistAgent(config);

    expect(agent.toolConfig?.tools).toContain('normal-tool');
    expect(agent.toolConfig?.tools).toContain('server__tool');
  });
});
