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
  })),
}));

describe('agent-scheduler', () => {
  let mockConfig: Mocked<Config>;
  let mockToolRegistry: Mocked<ToolRegistry>;
  let mockMessageBus: Mocked<MessageBus>;

  beforeEach(() => {
    mockMessageBus = {} as Mocked<MessageBus>;
    mockToolRegistry = {
      getTool: vi.fn(),
    } as unknown as Mocked<ToolRegistry>;
    mockConfig = {
      getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
    } as unknown as Mocked<Config>;
  });

  it('should create a scheduler with agent-specific config', async () => {
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

    // Verify that the scheduler's config has the overridden tool registry
    const schedulerConfig = vi.mocked(Scheduler).mock.calls[0][0].config;
    expect(schedulerConfig.getToolRegistry()).toBe(mockToolRegistry);
  });
});
