/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FinishReason } from '@google/genai';
import { LegacyAgentSession } from './legacy-agent-session.js';
import type { LegacyAgentSessionDeps } from './legacy-agent-session.js';
import { GeminiEventType } from '../core/turn.js';
import type { ServerGeminiStreamEvent } from '../core/turn.js';
import type { AgentEvent } from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type {
  CompletedToolCall,
  ToolCallRequestInfo,
} from '../scheduler/types.js';
import { CoreToolCallStatus } from '../scheduler/types.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDeps(
  overrides?: Partial<LegacyAgentSessionDeps>,
): LegacyAgentSessionDeps {
  const mockClient = {
    sendMessageStream: vi.fn(),
    getChat: vi.fn().mockReturnValue({
      recordCompletedToolCalls: vi.fn(),
    }),
    getCurrentSequenceModel: vi.fn().mockReturnValue(null),
  };

  const mockScheduler = {
    schedule: vi.fn().mockResolvedValue([]),
  };

  const mockConfig = {
    getMaxSessionTurns: vi.fn().mockReturnValue(-1),
    getModel: vi.fn().mockReturnValue('gemini-2.5-pro'),
  };

  return {
    client: mockClient as unknown as LegacyAgentSessionDeps['client'],

    scheduler: mockScheduler as unknown as LegacyAgentSessionDeps['scheduler'],

    config: mockConfig as unknown as LegacyAgentSessionDeps['config'],
    promptId: 'test-prompt',
    streamId: 'test-stream',
    ...overrides,
  };
}

async function* makeStream(
  events: ServerGeminiStreamEvent[],
): AsyncGenerator<ServerGeminiStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

function makeToolRequest(callId: string, name: string): ToolCallRequestInfo {
  return {
    callId,
    name,
    args: {},
    isClientInitiated: false,
    prompt_id: 'p1',
  };
}

function makeCompletedToolCall(
  callId: string,
  name: string,
  responseText: string,
): CompletedToolCall {
  return {
    status: CoreToolCallStatus.Success,
    request: makeToolRequest(callId, name),
    response: {
      callId,
      responseParts: [{ text: responseText }],
      resultDisplay: undefined,
      error: undefined,
      errorType: undefined,
    },

    tool: {} as CompletedToolCall extends { tool: infer T } ? T : never,

    invocation: {} as CompletedToolCall extends { invocation: infer T }
      ? T
      : never,
  } as CompletedToolCall;
}

async function collectEvents(
  session: LegacyAgentSession,
  options?: { streamId?: string; eventId?: string },
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  const streamOptions =
    options?.eventId || options?.streamId ? options : undefined;

  for await (const event of streamOptions
    ? session.stream(streamOptions)
    : session.stream()) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LegacyAgentSession', () => {
  let deps: LegacyAgentSessionDeps;

  beforeEach(() => {
    deps = createMockDeps();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe('send', () => {
    it('returns streamId', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.Content, value: 'hello' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      const result = await session.send({
        message: [{ type: 'text', text: 'hi' }],
      });

      expect(result.streamId).toBe('test-stream');
    });

    it('records the sent user message in the trajectory before send resolves', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      const { streamId } = await session.send({
        message: [{ type: 'text', text: 'hi' }],
        _meta: { source: 'user-test' },
      });

      const userMessage = session.events.find(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' && e.role === 'user' && e.streamId === streamId,
      );
      expect(userMessage?.content).toEqual([{ type: 'text', text: 'hi' }]);
      expect(userMessage?._meta).toEqual({ source: 'user-test' });

      await collectEvents(session, { streamId: streamId ?? undefined });
    });

    it('returns streamId before emitting agent_start', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      const liveEvents: AgentEvent[] = [];
      session.subscribe((event) => {
        liveEvents.push(event);
      });

      const { streamId } = await session.send({
        message: [{ type: 'text', text: 'hi' }],
      });

      expect(streamId).toBe('test-stream');
      expect(liveEvents.some((event) => event.type === 'agent_start')).toBe(
        false,
      );

      await collectEvents(session, { streamId: streamId ?? undefined });
      expect(liveEvents.some((event) => event.type === 'agent_start')).toBe(
        true,
      );
    });

    it('throws for non-message payloads', async () => {
      const session = new LegacyAgentSession(deps);
      await expect(session.send({ update: { title: 'test' } })).rejects.toThrow(
        'only supports message sends',
      );
    });

    it('throws if send is called while a stream is active', async () => {
      let resolveHang: (() => void) | undefined;
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        (async function* () {
          await new Promise<void>((resolve) => {
            resolveHang = resolve;
          });
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          } as ServerGeminiStreamEvent;
        })(),
      );

      const session = new LegacyAgentSession(deps);
      const { streamId } = await session.send({
        message: [{ type: 'text', text: 'first' }],
      });
      await vi.advanceTimersByTimeAsync(0);

      await expect(
        session.send({ message: [{ type: 'text', text: 'second' }] }),
      ).rejects.toThrow('cannot be called while a stream is active');

      resolveHang?.();
      await collectEvents(session, { streamId: streamId ?? undefined });
    });

    it('creates a new streamId after the previous stream completes', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'first response' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        )
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'second response' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        );

      const session = new LegacyAgentSession(deps);
      const first = await session.send({
        message: [{ type: 'text', text: 'first' }],
      });
      const firstEvents = await collectEvents(session, {
        streamId: first.streamId ?? undefined,
      });

      const second = await session.send({
        message: [{ type: 'text', text: 'second' }],
      });
      const secondEvents = await collectEvents(session, {
        streamId: second.streamId ?? undefined,
      });
      const userMessages = session.events.filter(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' && e.role === 'user',
      );

      expect(first.streamId).not.toBe(second.streamId);
      expect(
        userMessages.some(
          (e) =>
            e.streamId === first.streamId &&
            e.content[0]?.type === 'text' &&
            e.content[0].text === 'first',
        ),
      ).toBe(true);
      expect(
        userMessages.some(
          (e) =>
            e.streamId === second.streamId &&
            e.content[0]?.type === 'text' &&
            e.content[0].text === 'second',
        ),
      ).toBe(true);
      expect(firstEvents.some((e) => e.type === 'agent_end')).toBe(true);
      expect(secondEvents.some((e) => e.type === 'agent_end')).toBe(true);
    });
  });

  describe('stream - basic flow', () => {
    it('emits agent_start, content messages, and agent_end', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.Content, value: 'Hello' },
          { type: GeminiEventType.Content, value: ' World' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const types = events.map((e) => e.type);
      expect(types).toContain('agent_start');
      expect(types).toContain('message');
      expect(types).toContain('agent_end');

      const messages = events.filter(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' && e.role === 'agent',
      );
      expect(messages).toHaveLength(2);
      expect(messages[0]?.content).toEqual([{ type: 'text', text: 'Hello' }]);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('completed');
    });
  });

  describe('stream - tool calls', () => {
    it('handles a tool call round-trip', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      // First turn: model requests a tool
      sendMock.mockReturnValueOnce(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'read_file'),
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );
      // Second turn: model provides final answer
      sendMock.mockReturnValueOnce(
        makeStream([
          { type: GeminiEventType.Content, value: 'Done!' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockResolvedValueOnce([
        makeCompletedToolCall('call-1', 'read_file', 'file contents'),
      ]);

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'read a file' }] });
      const events = await collectEvents(session);

      const types = events.map((e) => e.type);
      expect(types).toContain('tool_request');
      expect(types).toContain('tool_response');
      expect(types).toContain('agent_end');

      const toolReq = events.find(
        (e): e is AgentEvent<'tool_request'> => e.type === 'tool_request',
      );
      expect(toolReq?.name).toBe('read_file');

      const toolResp = events.find(
        (e): e is AgentEvent<'tool_response'> => e.type === 'tool_response',
      );
      expect(toolResp?.name).toBe('read_file');
      expect(toolResp?.content).toEqual([
        { type: 'text', text: 'file contents' },
      ]);
      expect(toolResp?.isError).toBe(false);

      // Should have called sendMessageStream twice
      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('handles tool errors and sends error message in content', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValueOnce(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'write_file'),
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );
      sendMock.mockReturnValueOnce(
        makeStream([
          { type: GeminiEventType.Content, value: 'Failed' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const errorToolCall: CompletedToolCall = {
        status: CoreToolCallStatus.Error,
        request: makeToolRequest('call-1', 'write_file'),
        response: {
          callId: 'call-1',
          responseParts: [{ text: 'stale' }],
          resultDisplay: 'Error display',
          error: new Error('Permission denied'),
          errorType: 'permission_denied',
        },
      } as CompletedToolCall;

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockResolvedValueOnce([errorToolCall]);

      const session = new LegacyAgentSession(deps);
      await session.send({
        message: [{ type: 'text', text: 'write file' }],
      });
      const events = await collectEvents(session);

      const toolResp = events.find(
        (e): e is AgentEvent<'tool_response'> => e.type === 'tool_response',
      );
      expect(toolResp?.isError).toBe(true);
      // Uses error.message, not responseParts
      expect(toolResp?.content).toEqual([
        { type: 'text', text: 'Permission denied' },
      ]);
      expect(toolResp?.displayContent).toEqual([
        { type: 'text', text: 'Error display' },
      ]);
    });

    it('stops on STOP_EXECUTION tool error', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValueOnce(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'dangerous_tool'),
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const stopToolCall: CompletedToolCall = {
        status: CoreToolCallStatus.Error,
        request: makeToolRequest('call-1', 'dangerous_tool'),
        response: {
          callId: 'call-1',
          responseParts: [],
          resultDisplay: undefined,
          error: new Error('Stopped by policy'),
          errorType: ToolErrorType.STOP_EXECUTION,
        },
      } as CompletedToolCall;

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockResolvedValueOnce([stopToolCall]);

      const session = new LegacyAgentSession(deps);
      await session.send({
        message: [{ type: 'text', text: 'do something' }],
      });
      const events = await collectEvents(session);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('completed');
      // Should NOT make a second call
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('treats fatal tool errors as tool_response followed by agent_end failed', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValueOnce(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'write_file'),
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const fatalToolCall: CompletedToolCall = {
        status: CoreToolCallStatus.Error,
        request: makeToolRequest('call-1', 'write_file'),
        response: {
          callId: 'call-1',
          responseParts: [],
          resultDisplay: undefined,
          error: new Error('Disk full'),
          errorType: ToolErrorType.NO_SPACE_LEFT,
        },
      } as CompletedToolCall;

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockResolvedValueOnce([fatalToolCall]);

      const session = new LegacyAgentSession(deps);
      await session.send({
        message: [{ type: 'text', text: 'write file' }],
      });
      const events = await collectEvents(session);

      const toolResp = events.find(
        (e): e is AgentEvent<'tool_response'> => e.type === 'tool_response',
      );
      expect(toolResp?.isError).toBe(true);
      expect(toolResp?.content).toEqual([{ type: 'text', text: 'Disk full' }]);
      expect(
        events.some(
          (e): e is AgentEvent<'error'> =>
            e.type === 'error' && e.fatal === true,
        ),
      ).toBe(false);

      const streamEnd = events.findLast(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('failed');
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('stream - terminal events', () => {
    it('handles AgentExecutionStopped', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.AgentExecutionStopped,
            value: { reason: 'hook', systemMessage: 'Halted by hook' },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('completed');
      expect(streamEnd?.data).toEqual({ message: 'Halted by hook' });
    });

    it('handles AgentExecutionBlocked as non-terminal and continues the stream', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.AgentExecutionBlocked,
            value: { reason: 'Blocked by hook' },
          },
          { type: GeminiEventType.Content, value: 'Final answer' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const blocked = events.find(
        (e): e is AgentEvent<'error'> =>
          e.type === 'error' && e._meta?.['code'] === 'AGENT_EXECUTION_BLOCKED',
      );
      expect(blocked?.fatal).toBe(false);
      expect(blocked?.message).toBe('Agent execution blocked: Blocked by hook');

      const messages = events.filter(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' && e.role === 'agent',
      );
      expect(
        messages.some(
          (message) =>
            message.content[0]?.type === 'text' &&
            message.content[0].text === 'Final answer',
        ),
      ).toBe(true);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('completed');
    });

    it('handles Error events', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.Error,
            value: { error: new Error('API error') },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const err = events.find(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(err?.message).toBe('API error');
      expect(events.some((e) => e.type === 'agent_end')).toBe(true);
    });

    it('handles LoopDetected as non-terminal warning event', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      // LoopDetected followed by more content — stream continues
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.LoopDetected },
          { type: GeminiEventType.Content, value: 'continuing after loop' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const warning = events.find(
        (e): e is AgentEvent<'error'> =>
          e.type === 'error' && e._meta?.['code'] === 'LOOP_DETECTED',
      );
      expect(warning).toBeDefined();
      expect(warning?.fatal).toBe(false);

      // Stream should have continued — content after loop detected
      const messages = events.filter(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' && e.role === 'agent',
      );
      expect(
        messages.some(
          (m) =>
            m.content[0]?.type === 'text' &&
            m.content[0].text === 'continuing after loop',
        ),
      ).toBe(true);

      // Should still end with agent_end completed
      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('completed');
    });
  });

  describe('stream - max turns', () => {
    it('emits agent_end with max_turns when the session turn limit is exceeded', async () => {
      const configMock = deps.config.getMaxSessionTurns as ReturnType<
        typeof vi.fn
      >;
      configMock.mockReturnValue(0);

      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.Content, value: 'should not be reached' },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('max_turns');
      expect(streamEnd?.data).toEqual({
        code: 'MAX_TURNS_EXCEEDED',
        maxTurns: 0,
        turnCount: 0,
      });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('treats GeminiClient MaxSessionTurns as a terminal max_turns stream end', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([{ type: GeminiEventType.MaxSessionTurns }]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const errorEvents = events.filter(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(errorEvents).toHaveLength(0);

      const streamEnd = events.findLast(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('max_turns');
      expect(streamEnd?.data).toEqual({
        code: 'MAX_TURNS_EXCEEDED',
      });
    });
  });

  describe('abort', () => {
    it('treats abort before the first model event as aborted without fatal error', async () => {
      let releaseAbort: (() => void) | undefined;
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        (async function* () {
          await new Promise<void>((resolve) => {
            releaseAbort = resolve;
          });
          yield* [];
          const abortError = new Error('Aborted');
          abortError.name = 'AbortError';
          throw abortError;
        })(),
      );

      const session = new LegacyAgentSession(deps);
      const { streamId } = await session.send({
        message: [{ type: 'text', text: 'hi' }],
      });
      await vi.advanceTimersByTimeAsync(0);

      await session.abort();
      releaseAbort?.();

      const events = await collectEvents(session, {
        streamId: streamId ?? undefined,
      });
      expect(
        events.some(
          (event): event is AgentEvent<'error'> =>
            event.type === 'error' && event.fatal,
        ),
      ).toBe(false);

      const streamEnd = events.findLast(
        (event): event is AgentEvent<'agent_end'> => event.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('aborted');
    });

    it('aborts the stream', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      // Stream that yields content then checks abort signal via a deferred
      let resolveHang: (() => void) | undefined;
      sendMock.mockReturnValue(
        (async function* () {
          yield {
            type: GeminiEventType.Content,
            value: 'start',
          } as ServerGeminiStreamEvent;
          // Wait until externally resolved (by abort)
          await new Promise<void>((resolve) => {
            resolveHang = resolve;
          });
          yield {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          } as ServerGeminiStreamEvent;
        })(),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });

      // Give the loop time to start processing
      await new Promise((r) => setTimeout(r, 50));

      // Abort and resolve the hang so the generator can finish
      await session.abort();
      resolveHang?.();

      // Collect all events
      const events = await collectEvents(session);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('aborted');
    });

    it('treats abort during pending scheduler work as aborted without fatal error', async () => {
      let resolveSchedule: ((value: CompletedToolCall[]) => void) | undefined;
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'slow_tool'),
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockReturnValue(
        new Promise<CompletedToolCall[]>((resolve) => {
          resolveSchedule = resolve;
        }),
      );

      const session = new LegacyAgentSession(deps);
      const { streamId } = await session.send({
        message: [{ type: 'text', text: 'hi' }],
      });

      await new Promise((resolve) => setTimeout(resolve, 25));
      await session.abort();
      resolveSchedule?.([makeCompletedToolCall('call-1', 'slow_tool', 'done')]);

      const events = await collectEvents(session, {
        streamId: streamId ?? undefined,
      });
      expect(
        events.some(
          (event): event is AgentEvent<'error'> =>
            event.type === 'error' && event.fatal,
        ),
      ).toBe(false);
      expect(events.some((event) => event.type === 'tool_response')).toBe(
        false,
      );

      const streamEnd = events.findLast(
        (event): event is AgentEvent<'agent_end'> => event.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('aborted');
    });
  });

  describe('events property', () => {
    it('accumulates all events', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.Content, value: 'hi' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      await collectEvents(session);

      expect(session.events.length).toBeGreaterThan(0);
      expect(session.events[0]?.type).toBe('message');
    });
  });

  describe('subscription and stream scoping', () => {
    it('subscribe receives live events for the next stream', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.Content, value: 'hello later' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      const liveEvents: AgentEvent[] = [];
      const unsubscribe = session.subscribe((event) => {
        liveEvents.push(event);
      });

      const { streamId } = await session.send({
        message: [{ type: 'text', text: 'hi' }],
      });
      await collectEvents(session, { streamId: streamId ?? undefined });
      unsubscribe();

      expect(liveEvents.length).toBeGreaterThan(0);
      expect(liveEvents[0]?.type).toBe('message');
      expect(liveEvents.every((event) => event.streamId === streamId)).toBe(
        true,
      );
    });

    it('subscribe is live-only and does not replay old history when idle', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'first answer' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        )
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'second answer' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        );

      const session = new LegacyAgentSession(deps);
      const first = await session.send({
        message: [{ type: 'text', text: 'first request' }],
      });
      await collectEvents(session, { streamId: first.streamId ?? undefined });

      const liveEvents: AgentEvent[] = [];
      const unsubscribe = session.subscribe((event) => {
        liveEvents.push(event);
      });

      const second = await session.send({
        message: [{ type: 'text', text: 'second request' }],
      });
      await collectEvents(session, { streamId: second.streamId ?? undefined });
      unsubscribe();

      expect(liveEvents.length).toBeGreaterThan(0);
      expect(
        liveEvents.every((event) => event.streamId === second.streamId),
      ).toBe(true);
      expect(
        liveEvents.some(
          (event) =>
            event.type === 'message' &&
            event.role === 'user' &&
            event.content[0]?.type === 'text' &&
            event.content[0].text === 'first request',
        ),
      ).toBe(false);
    });

    it('streams only the requested streamId', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'first answer' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        )
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'second answer' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        );

      const session = new LegacyAgentSession(deps);
      const first = await session.send({
        message: [{ type: 'text', text: 'first request' }],
      });
      await collectEvents(session, { streamId: first.streamId ?? undefined });

      const second = await session.send({
        message: [{ type: 'text', text: 'second request' }],
      });
      await collectEvents(session, { streamId: second.streamId ?? undefined });

      const firstStreamEvents = await collectEvents(session, {
        streamId: first.streamId ?? undefined,
      });

      expect(
        firstStreamEvents.every((event) => event.streamId === first.streamId),
      ).toBe(true);
      expect(
        firstStreamEvents.some(
          (e) =>
            e.type === 'message' &&
            e.role === 'agent' &&
            e.content[0]?.type === 'text' &&
            e.content[0].text === 'first answer',
        ),
      ).toBe(true);
      expect(
        firstStreamEvents.some(
          (e) =>
            e.type === 'message' &&
            e.role === 'agent' &&
            e.content[0]?.type === 'text' &&
            e.content[0].text === 'second answer',
        ),
      ).toBe(false);
    });

    it('resumes from eventId within the same stream only', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'first answer' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        )
        .mockReturnValueOnce(
          makeStream([
            { type: GeminiEventType.Content, value: 'second answer' },
            {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            },
          ]),
        );

      const session = new LegacyAgentSession(deps);
      const first = await session.send({
        message: [{ type: 'text', text: 'first request' }],
      });
      await collectEvents(session, { streamId: first.streamId ?? undefined });

      await session.send({
        message: [{ type: 'text', text: 'second request' }],
      });
      await collectEvents(session);

      const firstAgentMessage = session.events.find(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' &&
          e.role === 'agent' &&
          e.streamId === first.streamId &&
          e.content[0]?.type === 'text' &&
          e.content[0].text === 'first answer',
      );
      expect(firstAgentMessage).toBeDefined();

      const resumedEvents = await collectEvents(session, {
        eventId: firstAgentMessage?.id,
      });
      expect(
        resumedEvents.every((event) => event.streamId === first.streamId),
      ).toBe(true);
      expect(resumedEvents.map((event) => event.type)).toEqual(['agent_end']);
      expect(
        resumedEvents.some(
          (e) =>
            e.type === 'message' &&
            e.role === 'agent' &&
            e.content[0]?.type === 'text' &&
            e.content[0].text === 'second answer',
        ),
      ).toBe(false);
    });
  });

  describe('agent_end ordering', () => {
    it('agent_end is always the final event yielded', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.Content, value: 'Hello' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]?.type).toBe('agent_end');
    });

    it('agent_end is final even after error events', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          {
            type: GeminiEventType.Error,
            value: { error: new Error('API error') },
          },
        ]),
      );

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      expect(events[events.length - 1]?.type).toBe('agent_end');
    });
  });

  describe('intermediate Finished events', () => {
    it('does NOT emit agent_end when tool calls are pending', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      // First turn: tool request + Finished (should NOT produce agent_end)
      sendMock.mockReturnValueOnce(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'read_file'),
          },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: {
                promptTokenCount: 50,
                candidatesTokenCount: 20,
              },
            },
          },
        ]),
      );
      // Second turn: final answer
      sendMock.mockReturnValueOnce(
        makeStream([
          { type: GeminiEventType.Content, value: 'Answer' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockResolvedValueOnce([
        makeCompletedToolCall('call-1', 'read_file', 'data'),
      ]);

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'do it' }] });
      const events = await collectEvents(session);

      // Only one agent_end at the very end
      const streamEnds = events.filter((e) => e.type === 'agent_end');
      expect(streamEnds).toHaveLength(1);
      expect(streamEnds[0]).toBe(events[events.length - 1]);
    });

    it('emits usage for intermediate Finished events', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValueOnce(
        makeStream([
          {
            type: GeminiEventType.ToolCallRequest,
            value: makeToolRequest('call-1', 'read_file'),
          },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 30,
              },
            },
          },
        ]),
      );
      sendMock.mockReturnValueOnce(
        makeStream([
          { type: GeminiEventType.Content, value: 'Done' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ]),
      );

      const scheduleMock = deps.scheduler.schedule as ReturnType<typeof vi.fn>;
      scheduleMock.mockResolvedValueOnce([
        makeCompletedToolCall('call-1', 'read_file', 'contents'),
      ]);

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await collectEvents(session);

      // Should have at least one usage event from the intermediate Finished
      const usageEvents = events.filter(
        (e): e is AgentEvent<'usage'> => e.type === 'usage',
      );
      expect(usageEvents.length).toBeGreaterThanOrEqual(1);
      expect(usageEvents[0]?.inputTokens).toBe(100);
      expect(usageEvents[0]?.outputTokens).toBe(30);
    });
  });

  describe('error handling in runLoop', () => {
    it('catches thrown errors and emits error + agent_end', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const err = events.find(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(err?.message).toBe('Connection refused');
      expect(err?.fatal).toBe(true);

      const streamEnd = events.find(
        (e): e is AgentEvent<'agent_end'> => e.type === 'agent_end',
      );
      expect(streamEnd?.reason).toBe('failed');
    });
  });

  describe('_emitErrorAndAgentEnd metadata', () => {
    it('preserves exitCode and code in _meta for FatalError', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      // Simulate a FatalError being thrown
      const { FatalError } = await import('../utils/errors.js');
      sendMock.mockImplementation(() => {
        throw new FatalError('Disk full', 44);
      });

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const err = events.find(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(err?.message).toBe('Disk full');
      expect(err?.fatal).toBe(true);
      expect(err?._meta?.['exitCode']).toBe(44);
      expect(err?._meta?.['errorName']).toBe('FatalError');
    });

    it('preserves exitCode for non-FatalError errors that carry one', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      const exitCodeError = new Error('custom exit');
      (exitCodeError as Error & { exitCode: number }).exitCode = 17;
      sendMock.mockImplementation(() => {
        throw exitCodeError;
      });

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const err = events.find(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(err?._meta?.['exitCode']).toBe(17);
    });

    it('preserves code in _meta for errors with code property', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      const codedError = new Error('ENOENT');
      (codedError as Error & { code: string }).code = 'ENOENT';
      sendMock.mockImplementation(() => {
        throw codedError;
      });

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const err = events.find(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(err?._meta?.['code']).toBe('ENOENT');
    });

    it('preserves status in _meta for errors with status property', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      const statusError = new Error('rate limited');
      (statusError as Error & { status: string }).status = 'RESOURCE_EXHAUSTED';
      sendMock.mockImplementation(() => {
        throw statusError;
      });

      const session = new LegacyAgentSession(deps);
      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await collectEvents(session);

      const err = events.find(
        (e): e is AgentEvent<'error'> => e.type === 'error',
      );
      expect(err?._meta?.['status']).toBe('RESOURCE_EXHAUSTED');
    });
  });
});
