/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentTool } from './agent-tool.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { RemoteAgentInvocation } from './remote-invocation.js';
import { BrowserAgentInvocation } from './browser/browserAgentInvocation.js';
import { BROWSER_AGENT_NAME } from './browser/browserAgentDefinition.js';
import { AgentRegistry } from './registry.js';
import type { LocalAgentDefinition, RemoteAgentDefinition } from './types.js';

vi.mock('./local-invocation.js');
vi.mock('./remote-invocation.js');
vi.mock('./browser/browserAgentInvocation.js');

describe('AgentTool', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;
  let tool: AgentTool;

  const testLocalDefinition: LocalAgentDefinition = {
    kind: 'local',
    name: 'TestLocalAgent',
    description: 'A local test agent.',
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: { objective: { type: 'string' } },
      },
    },
    modelConfig: { model: 'test', generateContentConfig: {} },
    runConfig: { maxTimeMinutes: 1 },
    promptConfig: { systemPrompt: 'test' },
  };

  const testRemoteDefinition: RemoteAgentDefinition = {
    kind: 'remote',
    name: 'TestRemoteAgent',
    description: 'A remote test agent.',
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
    },
    agentCardUrl: 'http://example.com/agent',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    mockMessageBus = createMockMessageBus();
    tool = new AgentTool(mockConfig, mockMessageBus);

    // Mock AgentRegistry
    const registry = new AgentRegistry(mockConfig);
    vi.spyOn(mockConfig, 'getAgentRegistry').mockReturnValue(registry);

    vi.spyOn(registry, 'getDefinition').mockImplementation((name: string) => {
      if (name === 'TestLocalAgent') return testLocalDefinition;
      if (name === 'TestRemoteAgent') return testRemoteDefinition;
      if (name === BROWSER_AGENT_NAME) {
        return {
          kind: 'remote',
          name: BROWSER_AGENT_NAME,
          displayName: 'Browser Agent',
          description: 'Browser Agent Description',
          inputConfig: {
            inputSchema: {
              type: 'object',
              properties: { task: { type: 'string' } },
            },
          },
          agentCardUrl: 'http://example.com',
        };
      }
      return undefined;
    });
  });

  it('should map prompt to objective for local agent', async () => {
    const params = { agent_name: 'TestLocalAgent', prompt: 'Do something' };
    const invocation = tool['createInvocation'](params, mockMessageBus);

    // Trigger deferred instantiation
    await invocation.shouldConfirmExecute(new AbortController().signal);

    expect(LocalSubagentInvocation).toHaveBeenCalledWith(
      testLocalDefinition,
      mockConfig,
      { objective: 'Do something' },
      mockMessageBus,
    );
  });

  it('should map prompt to query for remote agent', async () => {
    const params = {
      agent_name: 'TestRemoteAgent',
      prompt: 'Search something',
    };
    const invocation = tool['createInvocation'](params, mockMessageBus);

    // Trigger deferred instantiation
    await invocation.shouldConfirmExecute(new AbortController().signal);

    expect(RemoteAgentInvocation).toHaveBeenCalledWith(
      testRemoteDefinition,
      mockConfig,
      { query: 'Search something' },
      mockMessageBus,
    );
  });

  it('should throw error for unknown subagent', () => {
    const params = { agent_name: 'UnknownAgent', prompt: 'Hello' };
    expect(() => {
      tool['createInvocation'](params, mockMessageBus);
    }).toThrow("Subagent 'UnknownAgent' not found.");
  });

  it('should map prompt to task and use BrowserAgentInvocation for browser agent', async () => {
    const params = { agent_name: BROWSER_AGENT_NAME, prompt: 'Open page' };
    const invocation = tool['createInvocation'](params, mockMessageBus);

    // Trigger deferred instantiation
    await invocation.shouldConfirmExecute(new AbortController().signal);

    expect(BrowserAgentInvocation).toHaveBeenCalledWith(
      mockConfig,
      { task: 'Open page' },
      mockMessageBus,
      'invoke_agent',
      'Invoke Browser Agent',
    );
  });
});
