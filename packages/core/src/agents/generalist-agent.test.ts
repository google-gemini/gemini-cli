/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GeneralistAgent } from './generalist-agent.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { AgentRegistry } from './registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

describe('GeneralistAgent', () => {
  it('should create a valid generalist agent definition', () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'getToolRegistry').mockReturnValue({
      getAllToolNames: () => ['tool1', 'tool2'],
    } as unknown as ToolRegistry);
    vi.spyOn(config, 'getAgentRegistry').mockReturnValue({
      getDirectoryContext: () => 'mock directory context',
    } as unknown as AgentRegistry);

    const agent = GeneralistAgent(config);

    expect(agent.name).toBe('generalist');
    expect(agent.kind).toBe('local');
    expect(agent.modelConfig.model).toBe('inherit');
    expect(agent.toolConfig?.tools).toBeDefined();
    expect(agent.promptConfig.systemPrompt).toContain('CLI agent');
    // Ensure it's non-interactive
    expect(agent.promptConfig.systemPrompt).toContain('non-interactive');
  });
});
