/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from './agent.js';
import { AgentSession } from './session.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { type AgentConfig } from './types.js';

vi.mock('./session.js', () => ({
  AgentSession: vi.fn().mockImplementation(() => ({
    prompt: vi.fn().mockImplementation(async function* () {
      yield { type: 'agent_start', value: { sessionId: 'test-session' } };
      yield {
        type: 'agent_finish',
        value: { sessionId: 'test-session', totalTurns: 1 },
      };
    }),
  })),
}));

describe('Agent', () => {
  let mockConfig: ReturnType<typeof makeFakeConfig>;
  const agentConfig: AgentConfig = {
    name: 'TestAgent',
    systemInstruction: 'You are a test agent.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getSessionId').mockReturnValue('global-session-id');
  });

  it('should create an AgentSession', () => {
    const agent = new Agent(agentConfig, mockConfig);
    const session = agent.createSession('custom-session-id');

    expect(session).toBeDefined();
    expect(AgentSession).toHaveBeenCalledWith(
      'custom-session-id',
      agentConfig,
      mockConfig,
    );
  });

  it('should use global session ID if none provided to createSession', () => {
    const agent = new Agent(agentConfig, mockConfig);
    agent.createSession();

    expect(AgentSession).toHaveBeenCalledWith(
      'global-session-id',
      agentConfig,
      mockConfig,
    );
  });

  it('should prompt through a new session', async () => {
    const agent = new Agent(agentConfig, mockConfig);
    const events = [];
    for await (const event of agent.prompt('Hello')) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('agent_start');
    expect(events[1].type).toBe('agent_finish');
    expect(AgentSession).toHaveBeenCalled();
  });
});
