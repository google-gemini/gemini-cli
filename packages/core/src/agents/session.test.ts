/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSession } from './session.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { type AgentConfig } from './types.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { GeminiEventType } from '../core/turn.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { CompressionStatus } from '../core/turn.js';
import { AgentTerminateMode, type AgentEvent } from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';

vi.mock('../core/client.js');
vi.mock('../scheduler/scheduler.js');
vi.mock('../services/chatCompressionService.js');

describe('AgentSession', () => {
  let mockConfig: ReturnType<typeof makeFakeConfig>;
  let mockClient: {
    sendMessageStream: ReturnType<typeof vi.fn>;
    getChat: ReturnType<typeof vi.fn>;
    getCurrentSequenceModel: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
  };
  let mockScheduler: {
    schedule: ReturnType<typeof vi.fn>;
  };
  let mockCompressionService: {
    compress: ReturnType<typeof vi.fn>;
  };
  let session: AgentSession;
  const agentConfig: AgentConfig = {
    name: 'TestAgent',
    capabilities: { compression: true },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();

    mockClient = {
      sendMessageStream: vi.fn(),
      getChat: vi.fn().mockReturnValue({
        recordCompletedToolCalls: vi.fn(),
        setHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      }),
      getCurrentSequenceModel: vi.fn().mockReturnValue('test-model'),
      getHistory: vi.fn().mockReturnValue([]),
    };

    mockScheduler = {
      schedule: vi.fn(),
    };

    mockCompressionService = {
      compress: vi.fn().mockResolvedValue({
        newHistory: null,
        info: { compressionStatus: CompressionStatus.NOOP },
      }),
    };

    vi.spyOn(mockConfig, 'getGeminiClient').mockReturnValue(
      mockClient as unknown as import('../core/client.js').GeminiClient,
    );
    vi.mocked(Scheduler).mockImplementation(
      () => mockScheduler as unknown as Scheduler,
    );
    vi.mocked(ChatCompressionService).mockImplementation(
      () => mockCompressionService as unknown as ChatCompressionService,
    );

    session = new AgentSession('test-session', agentConfig, mockConfig);
  });

  it('should emit agent_start and agent_finish', async () => {
    mockClient.sendMessageStream.mockImplementation(async function* () {
      yield { type: GeminiEventType.Content, value: 'Hello' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    const events = [];
    for await (const event of session.prompt('Hi')) {
      events.push(event);
    }

    const finishEvent = events[events.length - 1] as Extract<
      AgentEvent,
      { type: 'agent_finish' }
    >;
    expect(events[0].type).toBe('agent_start');
    expect(finishEvent.type).toBe('agent_finish');
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.GOAL);
    expect(mockClient.sendMessageStream).toHaveBeenCalled();
  });

  it('should handle tool calls and execute them', async () => {
    // Turn 1: Model calls a tool
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'call1', name: 'test_tool', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    // Turn 2: Model finishes
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.Content, value: 'Tool executed' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockScheduler.schedule.mockResolvedValueOnce([
      {
        response: {
          callId: 'call1',
          responseParts: [
            {
              functionResponse: {
                name: 'test_tool',
                response: { ok: true },
                id: 'call1',
              },
            },
          ],
        },
      },
    ]);

    const events = [];
    for await (const event of session.prompt('Run tool')) {
      events.push(event);
    }

    expect(mockClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);

    const suiteStart = events.find((e) => e.type === 'tool_suite_start');
    const suiteFinish = events.find((e) => e.type === 'tool_suite_finish');
    expect(suiteStart).toBeDefined();
    expect(suiteFinish).toBeDefined();
    expect(suiteFinish?.value.responses[0].callId).toBe('call1');
  });

  it('should trigger compression if enabled', async () => {
    mockClient.sendMessageStream.mockImplementation(async function* () {
      yield { type: GeminiEventType.Content, value: 'Done' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    for await (const _ of session.prompt('Compress me')) {
      // consume stream to trigger compression
    }

    expect(mockCompressionService.compress).toHaveBeenCalled();
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    mockClient.sendMessageStream.mockImplementation(async function* () {
      yield { type: GeminiEventType.Content, value: 'Thinking...' };
      controller.abort();
      yield { type: GeminiEventType.Content, value: 'Still thinking...' };
    });

    const events = [];
    for await (const event of session.prompt('Long task', controller.signal)) {
      events.push(event);
    }

    // Should finish early
    const finishEvent = events[events.length - 1] as Extract<
      AgentEvent,
      { type: 'agent_finish' }
    >;
    expect(finishEvent.type).toBe('agent_finish');
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.ABORTED);
    // It might still yield the first chunk before the signal is processed in the loop
  });

  it('should emit ERROR reason when a tool requests stop', async () => {
    // Turn 1: Model calls a tool
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'call_stop', name: 'stop_tool', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockScheduler.schedule.mockResolvedValueOnce([
      {
        response: {
          callId: 'call_stop',
          errorType: ToolErrorType.STOP_EXECUTION,
          error: new Error('Deny listed command'),
          responseParts: [],
        },
      },
    ]);

    const events = [];
    for await (const event of session.prompt('Run tool')) {
      events.push(event);
    }

    const finishEvent = events.find(
      (e) => e.type === 'agent_finish',
    ) as Extract<AgentEvent, { type: 'agent_finish' }>;
    expect(finishEvent).toBeDefined();
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.ERROR);
    expect(finishEvent.value.message).toBe('Deny listed command');
  });

  it('should respect maxTurns from config', async () => {
    const customSession = new AgentSession(
      'test-session-2',
      { ...agentConfig, maxTurns: 2 },
      mockConfig,
    );

    // Mock an infinite loop of tool calls from the model
    mockClient.sendMessageStream.mockImplementation(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'call', name: 'test_tool', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockScheduler.schedule.mockResolvedValue([
      {
        response: {
          callId: 'call',
          responseParts: [
            {
              functionResponse: {
                name: 'test_tool',
                response: { ok: true },
                id: 'call',
              },
            },
          ],
        },
      },
    ]);

    const events = [];
    for await (const event of customSession.prompt('Start loop')) {
      events.push(event);
    }

    // It should perform exactly 2 turns, meaning mockScheduler.schedule is called twice
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(2);

    // The last event should be agent_finish
    const finishEvent = events[events.length - 1] as Extract<
      AgentEvent,
      { type: 'agent_finish' }
    >;
    expect(finishEvent.type).toBe('agent_finish');
    expect(finishEvent.value.totalTurns).toBe(2);
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.MAX_TURNS);
    expect(finishEvent.value.message).toBe('Maximum session turns exceeded.');
  });
});
