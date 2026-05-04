/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeneralistAgent } from './generalist-agent.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ApprovalMode } from '../policy/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRegistry } from './registry.js';

describe('GeneralistAgent', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_SYSTEM_MD', '');
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create a valid generalist agent definition', () => {
    const config = makeFakeConfig();
    const mockToolRegistry = {
      getAllToolNames: () => ['tool1', 'tool2', 'agent-tool'],
    } as unknown as ToolRegistry;
    vi.spyOn(config, 'getToolRegistry').mockReturnValue(mockToolRegistry);
    Object.defineProperty(config, 'toolRegistry', {
      get: () => mockToolRegistry,
    });
    Object.defineProperty(config, 'config', {
      get() {
        return this;
      },
    });

    vi.spyOn(config, 'getAgentRegistry').mockReturnValue({
      getDirectoryContext: () => 'mock directory context',
      getAllAgentNames: () => ['agent-tool'],
      getAllDefinitions: () => [],
      getDefinition: () => undefined,
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

  it('should adjust its description dynamically based on the approval mode', () => {
    const config = makeFakeConfig();
    const mockToolRegistry = {
      getAllToolNames: () => ['tool1'],
    } as unknown as ToolRegistry;
    Object.defineProperty(config, 'toolRegistry', {
      get: () => mockToolRegistry,
    });
    Object.defineProperty(config, 'config', {
      get() {
        return this;
      },
    });

    const agent = GeneralistAgent(config);

    // Default description
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.DEFAULT);
    expect(agent.description).toContain('batch refactoring/error fixing');
    expect(agent.description).not.toContain(
      'large-scale investigation and batch planning',
    );

    // Plan Mode description
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.PLAN);
    expect(agent.description).not.toContain('batch refactoring/error fixing');
    expect(agent.description).toContain(
      'large-scale investigation and batch planning',
    );
  });
});
