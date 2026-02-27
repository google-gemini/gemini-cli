/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSession } from './session.js';
import { makeFakeConfig } from '../test-utils/config.js';
import {
  type AgentConfig,
  AgentTerminateMode,
  type AgentEvent,
  type AgentFinishEvent,
  type ToolSuiteStartEvent,
  type ToolCallFinishEvent,
} from './types.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { GeminiEventType, CompressionStatus } from '../core/turn.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import {
  MessageBusType,
  type ToolCallsUpdateMessage,
} from '../confirmation-bus/types.js';
import {
  CoreToolCallStatus,
  type ToolCallRequestInfo,
} from '../scheduler/types.js';
import { type ResumedSessionData } from '../services/chatRecordingService.js';
import { type GeminiClient } from '../core/client.js';

vi.mock('../core/client.js');
vi.mock('../scheduler/scheduler.js');
vi.mock('../services/chatCompressionService.js');

describe('AgentSession', () => {
  let mockConfig: ReturnType<typeof makeFakeConfig>;
  let mockClient: {
    sendMessageStream: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    getChat: ReturnType<typeof vi.fn>;
    getCurrentSequenceModel: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
    resumeChat: ReturnType<typeof vi.fn>;
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
    systemInstruction: 'You are a test agent.',
    capabilities: { compression: true },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();

    mockClient = {
      sendMessageStream: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(false),
      initialize: vi.fn().mockResolvedValue(undefined),
      getChat: vi.fn().mockReturnValue({
        recordCompletedToolCalls: vi.fn(),
        setHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        setSystemInstruction: vi.fn(),
      }),
      getCurrentSequenceModel: vi.fn().mockReturnValue('test-model'),
      getHistory: vi.fn().mockReturnValue([]),
      resumeChat: vi.fn(),
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
      mockClient as unknown as GeminiClient,
    );
    vi.mocked(Scheduler).mockImplementation(
      (options) =>
        ({
          ...mockScheduler,
          schedulerId: (options as { schedulerId: string }).schedulerId,
        }) as unknown as Scheduler,
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

    const finishEvent = events[events.length - 1] as AgentFinishEvent;
    expect(events[0].type).toBe('agent_start');
    expect(finishEvent.type).toBe('agent_finish');
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.GOAL);
    expect(mockClient.sendMessageStream).toHaveBeenCalled();
  });

  it('should handle tool calls and execute them via MessageBus updates', async () => {
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'call1', name: 'test_tool', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.Content, value: 'Tool executed' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    const toolResponse = {
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
    };

    mockScheduler.schedule.mockImplementation(async () => {
      const bus = mockConfig.getMessageBus();
      const schedulerId = (session as unknown as { schedulerId: string })
        .schedulerId;

      await bus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        schedulerId,
        toolCalls: [
          {
            request: { callId: 'call1', name: 'test_tool', args: {} },
            status: CoreToolCallStatus.Executing,
            schedulerId,
          } as unknown as ToolCallsUpdateMessage['toolCalls'][number],
        ],
      });

      await bus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        schedulerId,
        toolCalls: [
          {
            request: { callId: 'call1', name: 'test_tool', args: {} },
            status: CoreToolCallStatus.Success,
            response: toolResponse.response,
            schedulerId,
          } as unknown as ToolCallsUpdateMessage['toolCalls'][number],
        ],
      });

      return [toolResponse];
    });

    const events = [];
    for await (const event of session.prompt('Run tool')) {
      events.push(event);
    }

    expect(mockClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);

    const callStart = events.find((e) => e.type === 'tool_call_start');
    const callFinish = events.find((e) => e.type === 'tool_call_finish');
    expect(callStart).toBeDefined();
    expect(callFinish).toBeDefined();
    expect((callFinish as ToolCallFinishEvent).value.callId).toBe('call1');
  });

  it('should handle multiple consecutive ReAct turns', async () => {
    // Turn 1: tool1
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'c1', name: 'tool1', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });
    // Turn 2: tool2
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'c2', name: 'tool2', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });
    // Turn 3: final content
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.Content, value: 'All done' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockScheduler.schedule.mockImplementation(async (calls) =>
      (calls as ToolCallRequestInfo[]).map((c) => ({
        response: { callId: c.callId, responseParts: [] },
      })),
    );

    const events = [];
    for await (const event of session.prompt('Start multistep')) {
      events.push(event);
    }

    expect(mockClient.sendMessageStream).toHaveBeenCalledTimes(3);
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === 'tool_suite_start')).toHaveLength(2);
  });

  it('should handle parallel tool calls in a single turn', async () => {
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'p1', name: 'toolA', args: {} },
      };
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'p2', name: 'toolB', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.Content, value: 'Parallel done' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockScheduler.schedule.mockImplementation(async (calls) =>
      (calls as ToolCallRequestInfo[]).map((c) => ({
        response: { callId: c.callId, responseParts: [] },
      })),
    );

    const events = [];
    for await (const event of session.prompt('Parallel')) {
      events.push(event);
    }

    const suiteStart = events.find(
      (e) => e.type === 'tool_suite_start',
    ) as ToolSuiteStartEvent;
    expect(suiteStart.value.count).toBe(2);
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);
    expect(mockScheduler.schedule).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ callId: 'p1' }),
        expect.objectContaining({ callId: 'p2' }),
      ]),
      expect.anything(),
    );
  });

  it('should resume from session data', async () => {
    const resumeData = {
      conversation: {
        messages: [{ type: 'user', content: 'Hello' }],
      },
    } as unknown as ResumedSessionData;

    await session.resume(resumeData);

    expect(mockClient.resumeChat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', parts: [{ text: 'Hello' }] }),
      ]),
      resumeData,
    );
  });

  it('should handle model stream errors gracefully', async () => {
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield* []; // satisfy require-yield
      throw new Error('Model connection lost');
    });

    const events: AgentEvent[] = [];
    try {
      for await (const event of session.prompt('Error test')) {
        events.push(event);
      }
    } catch (_e) {
      // Expected error
    }

    const finishEvent = events.find(
      (e) => e.type === 'agent_finish',
    ) as AgentFinishEvent;
    expect(finishEvent).toBeDefined();
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.ERROR);
    expect(finishEvent.value.message).toBe('Model connection lost');
  });

  it('should ignore MessageBus updates from other schedulers', async () => {
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield {
        type: GeminiEventType.ToolCallRequest,
        value: { callId: 'call1', name: 'test_tool', args: {} },
      };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.Content, value: 'Done' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    mockScheduler.schedule.mockImplementation(async () => {
      const bus = mockConfig.getMessageBus();

      // Update from ANOTHER scheduler
      await bus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        schedulerId: 'different-scheduler',
        toolCalls: [
          {
            request: { callId: 'call1', name: 'test_tool', args: {} },
            status: CoreToolCallStatus.Executing,
            schedulerId: 'different-scheduler',
          } as unknown as ToolCallsUpdateMessage['toolCalls'][number],
        ],
      });

      return [{ response: { callId: 'call1', responseParts: [] } }];
    });

    const events = [];
    for await (const event of session.prompt('Isolation test')) {
      events.push(event);
    }

    // Should NOT see tool_call_start because it was from a different schedulerId
    expect(events.find((e) => e.type === 'tool_call_start')).toBeUndefined();
  });

  it('should terminate with LOOP when loop is detected by model', async () => {
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.LoopDetected };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    const events = [];
    for await (const event of session.prompt('Loop')) {
      events.push(event);
    }
    const finishEvent = events.find(
      (e) => e.type === 'agent_finish',
    ) as AgentFinishEvent;
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.LOOP);
    expect(finishEvent.value.message).toContain('Loop detected');
  });

  it('should handle Part[] input correctly', async () => {
    mockClient.sendMessageStream.mockImplementationOnce(async function* () {
      yield { type: GeminiEventType.Content, value: 'I see parts' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    });

    const input = [{ text: 'Hello' }, { text: 'World' }];
    for await (const _ of session.prompt(input)) {
      // consume
    }

    expect(mockClient.sendMessageStream).toHaveBeenCalledWith(
      input,
      expect.anything(),
      expect.anything(),
      undefined,
      false,
      input,
    );
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

    const finishEvent = events[events.length - 1] as AgentFinishEvent;
    expect(finishEvent.type).toBe('agent_finish');
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.ABORTED);
  });

  it('should apply systemInstruction from AgentConfig', async () => {
    const customConfig: AgentConfig = {
      ...agentConfig,
      systemInstruction: 'You are a helpful assistant.',
    };

    // Mock isInitialized to true so constructor can set it
    mockClient.isInitialized.mockReturnValue(true);
    const mockChat = { setSystemInstruction: vi.fn() };
    mockClient.getChat.mockReturnValue(mockChat);

    // Re-create to trigger constructor logic
    new AgentSession('test-session-3', customConfig, mockConfig);
    expect(mockChat.setSystemInstruction).toHaveBeenCalledWith(
      'You are a helpful assistant.',
    );
  });

  it('should abort internal operations if caller stops iterating', async () => {
    let internalSignal: AbortSignal | undefined;

    mockClient.sendMessageStream.mockImplementation(async function* (
      _parts: unknown,
      signal: AbortSignal,
    ) {
      internalSignal = signal;
      yield { type: GeminiEventType.Content, value: 'Part 1' };
      yield { type: GeminiEventType.Content, value: 'Part 2' };
    });

    const promptStream = session.prompt('Test cancellation');
    const iterator = promptStream[Symbol.asyncIterator]();

    const firstEvent = await iterator.next();
    expect(firstEvent.value?.type).toBe('agent_start');

    const secondEvent = await iterator.next(); // content Part 1
    expect(secondEvent.value?.type).toBe(GeminiEventType.Content);

    // Caller stops here and closes the generator
    if (iterator.return) {
      await iterator.return();
    }

    expect(internalSignal?.aborted).toBe(true);
  });

  it('should respect maxTurns from config', async () => {
    const customSession = new AgentSession(
      'test-session-2',
      { ...agentConfig, maxTurns: 2 },
      mockConfig,
    );

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

    expect(mockScheduler.schedule).toHaveBeenCalledTimes(2);

    const finishEvent = events[events.length - 1] as AgentFinishEvent;
    expect(finishEvent.type).toBe('agent_finish');
    expect(finishEvent.value.totalTurns).toBe(2);
    expect(finishEvent.value.reason).toBe(AgentTerminateMode.MAX_TURNS);
  });
});
