/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FinishReason } from '@google/genai';
import { LegacyAgentSession } from './legacy-agent-session.js';
import type { LegacySessionDeps } from './legacy-agent-session.js';
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
  overrides?: Partial<LegacySessionDeps>,
): LegacySessionDeps {
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
    client: mockClient as unknown as LegacySessionDeps['client'],

    scheduler: mockScheduler as unknown as LegacySessionDeps['scheduler'],

    config: mockConfig as unknown as LegacySessionDeps['config'],
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
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of session.stream()) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LegacyAgentSession', () => {
  let deps: LegacySessionDeps;

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

    it('throws for non-message payloads', async () => {
      const session = new LegacyAgentSession(deps);
      await expect(session.send({ update: { title: 'test' } })).rejects.toThrow(
        'only supports message sends',
      );
    });
  });

  describe('stream - basic flow', () => {
    it('emits stream_start, content messages, and stream_end', async () => {
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
      expect(types).toContain('stream_start');
      expect(types).toContain('message');
      expect(types).toContain('stream_end');

      const messages = events.filter(
        (e): e is AgentEvent<'message'> =>
          e.type === 'message' && e.role === 'agent',
      );
      expect(messages).toHaveLength(2);
      expect(messages[0]?.content).toEqual([{ type: 'text', text: 'Hello' }]);

      const streamEnd = events.find(
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
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
      expect(types).toContain('stream_end');

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
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
      );
      expect(streamEnd?.reason).toBe('completed');
      // Should NOT make a second call
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
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
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
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
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
      expect(events.some((e) => e.type === 'stream_end')).toBe(true);
    });

    it('handles LoopDetected as non-terminal custom event', async () => {
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

      // Should have a custom loop_detected event
      const custom = events.find(
        (e): e is AgentEvent<'custom'> =>
          e.type === 'custom' && e.kind === 'loop_detected',
      );
      expect(custom).toBeDefined();

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

      // Should still end with stream_end completed
      const streamEnd = events.find(
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
      );
      expect(streamEnd?.reason).toBe('completed');
    });
  });

  describe('stream - max turns', () => {
    it('emits stream_end with max_turns when the session turn limit is exceeded', async () => {
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
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
      );
      expect(streamEnd?.reason).toBe('max_turns');
      expect(streamEnd?.data).toEqual({
        code: 'MAX_TURNS_EXCEEDED',
        maxTurns: 0,
        turnCount: 0,
      });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('treats GeminiClient MaxSessionTurns as a non-terminal warning event', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      sendMock.mockReturnValue(
        makeStream([
          { type: GeminiEventType.MaxSessionTurns },
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
          e.type === 'error' && e._meta?.['code'] === 'MAX_TURNS_EXCEEDED',
      );
      expect(warning?.fatal).toBe(false);

      const streamEnds = events.filter(
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
      );
      const streamEnd = streamEnds[streamEnds.length - 1];
      expect(streamEnd?.reason).toBe('completed');
    });
  });

  describe('abort', () => {
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
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
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
      expect(session.events[0]?.type).toBe('stream_start');
    });
  });

  describe('stream_end ordering', () => {
    it('stream_end is always the final event yielded', async () => {
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
      expect(events[events.length - 1]?.type).toBe('stream_end');
    });

    it('stream_end is final even after error events', async () => {
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

      expect(events[events.length - 1]?.type).toBe('stream_end');
    });
  });

  describe('intermediate Finished events', () => {
    it('does NOT emit stream_end when tool calls are pending', async () => {
      const sendMock = deps.client.sendMessageStream as ReturnType<
        typeof vi.fn
      >;
      // First turn: tool request + Finished (should NOT produce stream_end)
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

      // Only one stream_end at the very end
      const streamEnds = events.filter((e) => e.type === 'stream_end');
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
    it('catches thrown errors and emits error + stream_end', async () => {
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
        (e): e is AgentEvent<'stream_end'> => e.type === 'stream_end',
      );
      expect(streamEnd?.reason).toBe('failed');
    });
  });

  describe('_emitErrorAndStreamEnd metadata', () => {
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
  });
});
