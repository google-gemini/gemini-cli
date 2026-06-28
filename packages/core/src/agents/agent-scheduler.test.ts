/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { scheduleAgentTools } from './agent-scheduler.js';
import { Scheduler } from '../scheduler/scheduler.js';
import type { Config } from '../config/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

vi.mock('../scheduler/scheduler.js', () => ({
  Scheduler: vi.fn().mockImplementation(() => ({
    schedule: vi.fn().mockResolvedValue([{ status: 'success' }]),
    dispose: vi.fn(),
  })),
}));

describe('agent-scheduler', () => {
  let mockToolRegistry: Mocked<ToolRegistry>;
  let mockConfig: Mocked<Config>;
  let mockMessageBus: Mocked<MessageBus>;

  beforeEach(() => {
    vi.mocked(Scheduler).mockClear();
    mockMessageBus = {} as Mocked<MessageBus>;
    mockToolRegistry = {
      getTool: vi.fn(),
      messageBus: mockMessageBus,
    } as unknown as Mocked<ToolRegistry>;
    mockConfig = {
      messageBus: mockMessageBus,
      toolRegistry: mockToolRegistry,
    } as unknown as Mocked<Config>;
    (mockConfig as unknown as { messageBus: MessageBus }).messageBus =
      mockMessageBus;
    (mockConfig as unknown as { toolRegistry: ToolRegistry }).toolRegistry =
      mockToolRegistry;
  });

  it('should create a scheduler with agent-specific config', async () => {
    const mockConfig = {
      getPromptRegistry: vi.fn(),
      getResourceRegistry: vi.fn(),
      messageBus: mockMessageBus,
      toolRegistry: mockToolRegistry,
    } as unknown as Mocked<Config>;

    const requests: ToolCallRequestInfo[] = [
      {
        callId: 'call-1',
        name: 'test-tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    ];

    const options = {
      schedulerId: 'subagent-1',
      parentCallId: 'parent-1',
      toolRegistry: mockToolRegistry as unknown as ToolRegistry,
      signal: new AbortController().signal,
    };

    const results = await scheduleAgentTools(
      mockConfig as unknown as Config,
      requests,
      options,
    );

    expect(results).toEqual([{ status: 'success' }]);
    expect(Scheduler).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulerId: 'subagent-1',
        parentCallId: 'parent-1',
        messageBus: mockMessageBus,
      }),
    );

    // Verify that the scheduler's context has the overridden tool registry
    const schedulerConfig = vi.mocked(Scheduler).mock.calls[0][0].context;
    expect(schedulerConfig.toolRegistry).toBe(mockToolRegistry);
  });

  it('should override toolRegistry getter from prototype chain', async () => {
    const mainRegistry = { _id: 'main' } as unknown as Mocked<ToolRegistry>;
    const agentRegistry = {
      _id: 'agent',
      messageBus: mockMessageBus,
    } as unknown as Mocked<ToolRegistry>;

    const config = {
      getPromptRegistry: vi.fn(),
      getResourceRegistry: vi.fn(),
      messageBus: mockMessageBus,
    } as unknown as Mocked<Config>;
    Object.defineProperty(config, 'toolRegistry', {
      get: () => mainRegistry,
      configurable: true,
    });

    await scheduleAgentTools(
      config as unknown as Config,
      [
        {
          callId: 'c1',
          name: 'new_page',
          args: {},
          isClientInitiated: false,
          prompt_id: 'p1',
        },
      ],
      {
        schedulerId: 'browser-1',
        toolRegistry: agentRegistry as unknown as ToolRegistry,
        signal: new AbortController().signal,
      },
    );

    const schedulerConfig = vi.mocked(Scheduler).mock.calls[0][0].context;
    expect(schedulerConfig.toolRegistry).toBe(agentRegistry);
    expect(schedulerConfig.toolRegistry).not.toBe(mainRegistry);
  });

  it('should dispose the scheduler after schedule completes', async () => {
    const mockConfig = {
      getPromptRegistry: vi.fn(),
      getResourceRegistry: vi.fn(),
      messageBus: mockMessageBus,
      toolRegistry: mockToolRegistry,
    } as unknown as Mocked<Config>;

    const options = {
      schedulerId: 'subagent-1',
      toolRegistry: mockToolRegistry as unknown as ToolRegistry,
      signal: new AbortController().signal,
    };

    await scheduleAgentTools(mockConfig as unknown as Config, [], options);

    const schedulerInstance = vi.mocked(Scheduler).mock.results[0].value;
    expect(schedulerInstance.dispose).toHaveBeenCalledOnce();
  });

  it('should dispose the scheduler even when schedule throws', async () => {
    const scheduleError = new Error('schedule failed');
    vi.mocked(Scheduler).mockImplementationOnce(
      () =>
        ({
          schedule: vi.fn().mockRejectedValue(scheduleError),
          dispose: vi.fn(),
        }) as unknown as Scheduler,
    );

    const mockConfig = {
      getPromptRegistry: vi.fn(),
      getResourceRegistry: vi.fn(),
      messageBus: mockMessageBus,
      toolRegistry: mockToolRegistry,
    } as unknown as Mocked<Config>;

    const options = {
      schedulerId: 'subagent-1',
      toolRegistry: mockToolRegistry as unknown as ToolRegistry,
      signal: new AbortController().signal,
    };

    await expect(
      scheduleAgentTools(mockConfig as unknown as Config, [], options),
    ).rejects.toThrow('schedule failed');

    const schedulerInstance = vi.mocked(Scheduler).mock.results[0].value;
    expect(schedulerInstance.dispose).toHaveBeenCalledOnce();
  });

  it('should create an AgentLoopContext that has a defined .config property', async () => {
    const mockConfig = {
      getPromptRegistry: vi.fn(),
      getResourceRegistry: vi.fn(),
      messageBus: mockMessageBus,
      toolRegistry: mockToolRegistry,
      promptId: 'test-prompt',
    } as unknown as Mocked<Config>;

    const options = {
      schedulerId: 'subagent-1',
      toolRegistry: mockToolRegistry as unknown as ToolRegistry,
      signal: new AbortController().signal,
    };

    await scheduleAgentTools(mockConfig as unknown as Config, [], options);

    const schedulerContext = vi.mocked(Scheduler).mock.calls[0][0].context;
    expect(schedulerContext.config).toBeDefined();
    expect(schedulerContext.config.promptId).toBe('test-prompt');
    expect(schedulerContext.toolRegistry).toBe(mockToolRegistry);
  });
});
