/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { LegacyAgentSession } from './legacy-agent-session.js';
import type { GeminiClient } from '../core/client.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { Config } from '../config/config.js';
import { GeminiEventType } from '../core/turn.js';
import type { ServerGeminiStreamEvent, Turn } from '../core/turn.js';
import type {
  ToolCallRequestInfo,
  CompletedToolCall,
  SuccessfulToolCall,
  ErroredToolCall,
} from '../scheduler/types.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { FinishReason } from '@google/genai';
import type { AgentEvent } from './types.js';
import type { AnyDeclarativeTool, AnyToolInvocation } from '../tools/tools.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    getMaxSessionTurns: () => -1, // no limit
    getModel: () => 'gemini-2.5-pro',
    ...overrides,
  } as unknown as Config;
}

function makeScheduler(
  impl?: (
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
  ) => Promise<CompletedToolCall[]>,
): Scheduler {
  return {
    schedule: impl ?? (async () => []),
  } as unknown as Scheduler;
}

/**
 * Creates a mock client whose sendMessageStream yields canned events.
 * Supports multiple turns: each call to sendMessageStream pops the next
 * set of events from the queue.
 */
function makeAsyncClient(eventSets: ServerGeminiStreamEvent[][]): GeminiClient {
  let callIndex = 0;
  return {
    sendMessageStream(..._args: unknown[]) {
      const events = eventSets[callIndex] ?? [];
      callIndex++;
      async function* gen(): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
        for (const event of events) {
          yield event;
        }
        return {} as Turn;
      }
      return gen();
    },
    getChat: () => ({
      recordCompletedToolCalls: vi.fn(),
    }),
    getCurrentSequenceModel: () => null,
  } as unknown as GeminiClient;
}

/** Collect all events from stream() into an array. */
async function collectStream(
  session: LegacyAgentSession,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of session.stream()) {
    events.push(event);
  }
  return events;
}

/** Wait for stream to complete (all events settled). */
async function waitForStreamEnd(
  session: LegacyAgentSession,
  timeoutMs = 2000,
): Promise<AgentEvent[]> {
  return Promise.race([
    collectStream(session),
    new Promise<AgentEvent[]>((_, reject) =>
      setTimeout(() => reject(new Error('Stream timed out')), timeoutMs),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LegacyAgentSession', () => {
  // -----------------------------------------------------------------------
  // Text-only response
  // -----------------------------------------------------------------------

  describe('text-only response', () => {
    it('emits stream_start → message → usage → stream_end', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Hello!' },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
              },
            },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Hi' }],
      });

      const events = await waitForStreamEnd(session);
      const types = events.map((e) => e.type);

      expect(types).toEqual(['stream_start', 'message', 'usage', 'stream_end']);

      const msg = events[1] as AgentEvent<'message'>;
      expect(msg.role).toBe('agent');
      expect(msg.content).toEqual([{ type: 'text', text: 'Hello!' }]);

      const end = events[3] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('completed');
    });
  });

  // -----------------------------------------------------------------------
  // Response with tool call
  // -----------------------------------------------------------------------

  describe('response with tool call', () => {
    it('emits tool_request and tool_response events', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'call-1',
        name: 'read_file',
        args: { path: '/tmp/test.txt' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const completedToolCall: SuccessfulToolCall = {
        status: CoreToolCallStatus.Success,
        request: toolRequest,
        response: {
          callId: 'call-1',
          responseParts: [{ text: 'file contents here' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
        },
        tool: {} as unknown as AnyDeclarativeTool,
        invocation: {} as unknown as AnyToolInvocation,
      };

      // Turn 1: model calls a tool
      // Turn 2: model responds with text (no more tool calls)
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Let me read that.' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'The file says: hello' },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: {
                promptTokenCount: 20,
                candidatesTokenCount: 10,
              },
            },
          },
        ],
      ]);

      const scheduler = makeScheduler(async () => [completedToolCall]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Read the file' }],
      });

      const events = await waitForStreamEnd(session);
      const types = events.map((e) => e.type);

      expect(types).toEqual([
        // Turn 1 — Finished's stream_end suppressed (tool calls pending)
        'stream_start',
        'message', // "Let me read that."
        'tool_request', // read_file
        // Tool response (from scheduler, after Finished)
        'tool_response',
        // Turn 2 — no tool calls, Finished's stream_end passes through
        'session_update', // second ModelInfo
        'message', // "The file says: hello"
        'usage',
        'stream_end', // final
      ]);

      // Verify tool_request
      const toolReq = events.find(
        (e) => e.type === 'tool_request',
      ) as AgentEvent<'tool_request'>;
      expect(toolReq.requestId).toBe('call-1');
      expect(toolReq.name).toBe('read_file');

      // Verify tool_response
      const toolResp = events.find(
        (e) => e.type === 'tool_response',
      ) as AgentEvent<'tool_response'>;
      expect(toolResp.requestId).toBe('call-1');
      expect(toolResp.name).toBe('read_file');
      expect(toolResp.content).toEqual([
        { type: 'text', text: 'file contents here' },
      ]);
      expect(toolResp.isError).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-turn tool loop
  // -----------------------------------------------------------------------

  describe('multi-turn tool loop', () => {
    it('handles multiple tool call turns', async () => {
      const tool1Request: ToolCallRequestInfo = {
        callId: 'call-1',
        name: 'list_files',
        args: { dir: '/' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const tool2Request: ToolCallRequestInfo = {
        callId: 'call-2',
        name: 'read_file',
        args: { path: '/main.ts' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      let schedulerCallCount = 0;
      const scheduler = makeScheduler(async (requests) => {
        schedulerCallCount++;
        return requests.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: `Result for ${req.name}` }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        );
      });

      const client = makeAsyncClient([
        // Turn 1: list_files
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          {
            type: GeminiEventType.ToolCallRequest,
            value: tool1Request,
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        // Turn 2: read_file
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          {
            type: GeminiEventType.ToolCallRequest,
            value: tool2Request,
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        // Turn 3: final text response
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done!' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Analyze the project' }],
      });

      const events = await waitForStreamEnd(session);

      // Two scheduler calls
      expect(schedulerCallCount).toBe(2);

      // Should have tool_request and tool_response for both tools
      const toolRequests = events.filter((e) => e.type === 'tool_request');
      const toolResponses = events.filter((e) => e.type === 'tool_response');
      expect(toolRequests).toHaveLength(2);
      expect(toolResponses).toHaveLength(2);

      // Final message
      const messages = events.filter((e) => e.type === 'message');
      const finalMsg = messages[messages.length - 1];
      expect(finalMsg.content).toEqual([{ type: 'text', text: 'Done!' }]);
    });
  });

  // -----------------------------------------------------------------------
  // Error during streaming
  // -----------------------------------------------------------------------

  describe('error during streaming', () => {
    it('emits error and stream_end with failed reason', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          {
            type: GeminiEventType.Error,
            value: { error: { message: 'API rate limited', status: 429 } },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Hi' }],
      });

      const events = await waitForStreamEnd(session);
      const types = events.map((e) => e.type);

      expect(types).toContain('error');
      expect(types).toContain('stream_end');

      const err = events.find((e) => e.type === 'error') as AgentEvent<'error'>;
      expect(err.status).toBe('RESOURCE_EXHAUSTED');
      expect(err.message).toBe('API rate limited');
    });
  });

  // -----------------------------------------------------------------------
  // Max turns exceeded
  // -----------------------------------------------------------------------

  describe('max turns exceeded', () => {
    it('emits stream_end with max_turns reason', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'call-1',
        name: 'loop_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      // Client always returns tool requests → infinite loop
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          {
            type: GeminiEventType.ToolCallRequest,
            value: { ...toolRequest, callId: 'call-2' },
          },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        // Turn 3 would be attempted but max_turns (2) exceeded
      ]);

      const scheduler = makeScheduler(async (requests) =>
        requests.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig({ getMaxSessionTurns: () => 2 }),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Do stuff' }],
      });

      const events = await waitForStreamEnd(session);
      const lastEvent = events[events.length - 1] as AgentEvent<'stream_end'>;
      expect(lastEvent.type).toBe('stream_end');
      expect(lastEvent.reason).toBe('max_turns');
    });
  });

  // -----------------------------------------------------------------------
  // Tool requests stop execution
  // -----------------------------------------------------------------------

  describe('stop execution tool', () => {
    it('stops when a tool returns STOP_EXECUTION error type', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'call-1',
        name: 'dangerous_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const stoppedToolCall: ErroredToolCall = {
        status: CoreToolCallStatus.Error,
        request: toolRequest,
        response: {
          callId: 'call-1',
          responseParts: [{ text: 'Stopped by hook' }],
          resultDisplay: undefined,
          error: new Error('Stopped by hook'),
          errorType: ToolErrorType.STOP_EXECUTION,
        },
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async () => [stoppedToolCall]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Run tool' }],
      });

      const events = await waitForStreamEnd(session);

      // Should have tool_response and then stream_end
      const toolResp = events.find(
        (e) => e.type === 'tool_response',
      ) as AgentEvent<'tool_response'>;
      expect(toolResp.isError).toBe(true);

      const lastEvent = events[events.length - 1] as AgentEvent<'stream_end'>;
      expect(lastEvent.type).toBe('stream_end');
      expect(lastEvent.reason).toBe('completed');
    });
  });

  // -----------------------------------------------------------------------
  // Agent execution stopped
  // -----------------------------------------------------------------------

  describe('AgentExecutionStopped', () => {
    it('emits stream_end with completed reason', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          {
            type: GeminiEventType.AgentExecutionStopped,
            value: {
              reason: 'Hook stopped execution',
              systemMessage: 'Stopped by policy.',
            },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Hi' }],
      });

      const events = await waitForStreamEnd(session);
      const types = events.map((e) => e.type);

      expect(types).toContain('stream_start');
      expect(types).toContain('message'); // systemMessage
      expect(types).toContain('stream_end');

      const end = events.find(
        (e) => e.type === 'stream_end',
      ) as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('completed');
    });
  });

  // -----------------------------------------------------------------------
  // abort()
  // -----------------------------------------------------------------------

  describe('abort()', () => {
    it('signals abort and terminates the loop', async () => {
      // Client that yields events slowly (simulated by yielding content + never finishing)
      let abortSignalCaptured: AbortSignal | undefined;
      const client: GeminiClient = {
        sendMessageStream(_request: unknown, signal: AbortSignal) {
          abortSignalCaptured = signal;
          async function* gen(): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
            yield {
              type: GeminiEventType.ModelInfo,
              value: 'gemini-2.5-pro',
            };
            yield { type: GeminiEventType.Content, value: 'Starting...' };
            // Simulate delay — abort will fire during this
            await new Promise((resolve) => setTimeout(resolve, 50));
            // If we get here, yield more and finish
            yield {
              type: GeminiEventType.Finished,
              value: { reason: FinishReason.STOP, usageMetadata: undefined },
            };
            return {} as Turn;
          }
          return gen();
        },
        getChat: () => ({
          recordCompletedToolCalls: vi.fn(),
        }),
        getCurrentSequenceModel: () => null,
      } as unknown as GeminiClient;

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Hi' }],
      });

      // Give the loop a moment to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Abort
      await session.abort();
      expect(abortSignalCaptured?.aborted).toBe(true);

      const events = await waitForStreamEnd(session);
      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('stream_end');
    });
  });

  // -----------------------------------------------------------------------
  // stream() replay
  // -----------------------------------------------------------------------

  describe('stream()', () => {
    it('replays all events after loop completes', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Hi' }],
      });

      const events = await waitForStreamEnd(session);

      // Second call to stream() should replay the same events
      const replayed: AgentEvent[] = [];
      for await (const event of session.stream()) {
        replayed.push(event);
      }

      expect(replayed).toEqual(events);
      expect(replayed).toEqual(session.events);
    });

    it('supports eventId for resuming', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Hello!' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'test-stream',
      });

      await session.send({
        message: [{ type: 'text', text: 'Hi' }],
      });

      const events = await waitForStreamEnd(session);

      // Resume from after first event
      const replayed: AgentEvent[] = [];
      for await (const event of session.stream({
        eventId: events[0].id,
      })) {
        replayed.push(event);
      }

      expect(replayed).toHaveLength(events.length - 1);
      expect(replayed[0].id).toBe(events[1].id);
    });
  });

  // -----------------------------------------------------------------------
  // send() rejects non-message payloads
  // -----------------------------------------------------------------------

  describe('send() validation', () => {
    it('throws for non-message sends', async () => {
      const session = new LegacyAgentSession({
        client: makeAsyncClient([]),
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
      });

      await expect(
        session.send({ update: { title: 'new title' } }),
      ).rejects.toThrow('only supports message sends');
    });
  });

  // =======================================================================
  // Consumer-contract integration tests
  // These validate the exact event sequences and payloads that
  // nonInteractiveCli.ts depends on.
  // =======================================================================

  describe('consumer contract', () => {
    // ---------------------------------------------------------------------
    // Every stream must start with stream_start and end with stream_end
    // ---------------------------------------------------------------------

    it('always emits exactly one stream_start and one stream_end', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Hi' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'hi' }] });
      const events = await waitForStreamEnd(session);

      const starts = events.filter((e) => e.type === 'stream_start');
      const ends = events.filter((e) => e.type === 'stream_end');
      expect(starts).toHaveLength(1);
      expect(ends).toHaveLength(1);
    });

    // ---------------------------------------------------------------------
    // stream_end is always the last event
    // ---------------------------------------------------------------------

    it('stream_end is always the final event', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'read_file',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async (reqs) =>
        reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      expect(events[events.length - 1].type).toBe('stream_end');
    });

    // ---------------------------------------------------------------------
    // Intermediate Finished events don't produce stream_end
    // ---------------------------------------------------------------------

    it('intermediate Finished events do not produce stream_end', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
            },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Final.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async (reqs) =>
        reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'done' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      // Only ONE stream_end from the final Finished, not two
      const streamEnds = events.filter((e) => e.type === 'stream_end');
      expect(streamEnds).toHaveLength(1);

      // But intermediate usage IS emitted (from turn 1's Finished)
      const usages = events.filter((e) => e.type === 'usage');
      expect(usages).toHaveLength(1);
    });

    // ---------------------------------------------------------------------
    // tool_response events come between tool_request and next turn
    // ---------------------------------------------------------------------

    it('tool_response appears between tool_request and next turn content', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'search',
        args: { query: 'test' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Found it.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async () => [
        {
          status: CoreToolCallStatus.Success,
          request: toolRequest,
          response: {
            callId: 'c1',
            responseParts: [{ text: '3 results' }],
            resultDisplay: 'Searched: 3 results found',
            error: undefined,
            errorType: undefined,
          },
          tool: {} as unknown as AnyDeclarativeTool,
          invocation: {} as unknown as AnyToolInvocation,
        } as SuccessfulToolCall,
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);
      const types = events.map((e) => e.type);

      const reqIdx = types.indexOf('tool_request');
      const respIdx = types.indexOf('tool_response');
      const nextMsgIdx = types.indexOf('message', respIdx);

      expect(reqIdx).toBeGreaterThan(-1);
      expect(respIdx).toBeGreaterThan(reqIdx);
      expect(nextMsgIdx).toBeGreaterThan(respIdx);

      // Verify displayContent is populated from resultDisplay
      const resp = events[respIdx] as AgentEvent<'tool_response'>;
      expect(resp.displayContent).toEqual([
        { type: 'text', text: 'Searched: 3 results found' },
      ]);
    });

    // ---------------------------------------------------------------------
    // Error tool responses carry isError and content
    // ---------------------------------------------------------------------

    it('error tool responses carry isError=true and error content', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'write_file',
        args: { path: '/bad' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Sorry about that.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async () => [
        {
          status: CoreToolCallStatus.Error,
          request: toolRequest,
          response: {
            callId: 'c1',
            responseParts: [{ text: 'Permission denied: /bad' }],
            resultDisplay: 'Cannot write to /bad',
            error: new Error('Permission denied'),
            errorType: ToolErrorType.PATH_NOT_IN_WORKSPACE,
          },
        } as ErroredToolCall,
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      const resp = events.find(
        (e) => e.type === 'tool_response',
      ) as AgentEvent<'tool_response'>;
      expect(resp.isError).toBe(true);
      expect(resp.name).toBe('write_file');
      expect(resp.content).toEqual([
        { type: 'text', text: 'Permission denied' },
      ]);
      expect(resp.displayContent).toEqual([
        { type: 'text', text: 'Cannot write to /bad' },
      ]);
    });

    // ---------------------------------------------------------------------
    // Fatal tool error (NO_SPACE_LEFT) emits error{fatal:true} + stream_end
    // ---------------------------------------------------------------------

    it('NO_SPACE_LEFT emits fatal error and stops', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'write_file',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async () => [
        {
          status: CoreToolCallStatus.Error,
          request: toolRequest,
          response: {
            callId: 'c1',
            responseParts: [{ text: 'No space left on device' }],
            resultDisplay: undefined,
            error: new Error('No space left on device'),
            errorType: ToolErrorType.NO_SPACE_LEFT,
          },
        } as ErroredToolCall,
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      // Should have tool_response, then fatal error, then stream_end
      const error = events.find(
        (e) => e.type === 'error',
      ) as AgentEvent<'error'>;
      expect(error).toBeDefined();
      expect(error.fatal).toBe(true);
      expect(error.message).toContain('No space left');

      const end = events[events.length - 1] as AgentEvent<'stream_end'>;
      expect(end.type).toBe('stream_end');
      expect(end.reason).toBe('completed');
    });

    // ---------------------------------------------------------------------
    // LoopDetected emits error{fatal:true} + stream_end{failed}
    // ---------------------------------------------------------------------

    it('LoopDetected emits non-fatal error and stream_end(failed)', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Working...' },
          { type: GeminiEventType.LoopDetected },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      const error = events.find(
        (e) => e.type === 'error',
      ) as AgentEvent<'error'>;
      expect(error.fatal).toBe(false);
      expect(error.message).toBe('Loop detected, stopping execution');

      const end = events[events.length - 1] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('failed');
    });

    // ---------------------------------------------------------------------
    // AgentExecutionBlocked emits non-fatal error + stream_end(failed)
    // ---------------------------------------------------------------------

    it('AgentExecutionBlocked emits non-fatal error then stream_end(failed)', async () => {
      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          {
            type: GeminiEventType.AgentExecutionBlocked,
            value: { reason: 'Policy violation' },
          },
        ],
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler: makeScheduler(),
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      const error = events.find(
        (e) => e.type === 'error',
      ) as AgentEvent<'error'>;
      expect(error.fatal).toBe(false);
      expect(error.message).toBe('Policy violation');

      const end = events[events.length - 1] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('failed');
    });

    // ---------------------------------------------------------------------
    // Scheduler is called with correct arguments
    // ---------------------------------------------------------------------

    it('passes tool call requests to scheduler correctly', async () => {
      const tool1: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'read_file',
        args: { path: '/a.txt' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };
      const tool2: ToolCallRequestInfo = {
        callId: 'c2',
        name: 'write_file',
        args: { path: '/b.txt', content: 'hi' },
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: tool1 },
          { type: GeminiEventType.ToolCallRequest, value: tool2 },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      let capturedRequests: ToolCallRequestInfo[] = [];
      const scheduler = makeScheduler(async (reqs) => {
        capturedRequests = reqs;
        return reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        );
      });

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      await waitForStreamEnd(session);

      // Scheduler received both tool requests
      expect(capturedRequests).toHaveLength(2);
      expect(capturedRequests[0].name).toBe('read_file');
      expect(capturedRequests[1].name).toBe('write_file');
    });

    // ---------------------------------------------------------------------
    // Tool response parts are fed back to the client
    // ---------------------------------------------------------------------

    it('feeds tool response parts back to client for next turn', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'read_file',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      let capturedSecondTurnParts: unknown[] = [];
      let callIndex = 0;

      const client: GeminiClient = {
        sendMessageStream(...args: unknown[]) {
          callIndex++;
          if (callIndex === 2) {
            capturedSecondTurnParts = args[0] as unknown[];
          }
          const events: ServerGeminiStreamEvent[][] = [
            [
              { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
              {
                type: GeminiEventType.ToolCallRequest,
                value: toolRequest,
              },
              {
                type: GeminiEventType.Finished,
                value: {
                  reason: FinishReason.STOP,
                  usageMetadata: undefined,
                },
              },
            ],
            [
              { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
              { type: GeminiEventType.Content, value: 'Got it.' },
              {
                type: GeminiEventType.Finished,
                value: {
                  reason: FinishReason.STOP,
                  usageMetadata: undefined,
                },
              },
            ],
          ];
          const turnEvents = events[callIndex - 1] ?? [];
          async function* gen(): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
            for (const e of turnEvents) yield e;
            return {} as Turn;
          }
          return gen();
        },
        getChat: () => ({ recordCompletedToolCalls: vi.fn() }),
        getCurrentSequenceModel: () => null,
      } as unknown as GeminiClient;

      const scheduler = makeScheduler(async () => [
        {
          status: CoreToolCallStatus.Success,
          request: toolRequest,
          response: {
            callId: 'c1',
            responseParts: [
              { text: 'file-content-A' },
              { text: 'file-content-B' },
            ],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
          tool: {} as unknown as AnyDeclarativeTool,
          invocation: {} as unknown as AnyToolInvocation,
        } as SuccessfulToolCall,
      ]);

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      await waitForStreamEnd(session);

      // Second turn received the tool response parts
      expect(capturedSecondTurnParts).toEqual([
        { text: 'file-content-A' },
        { text: 'file-content-B' },
      ]);
    });

    // ---------------------------------------------------------------------
    // Usage from both intermediate and final turns is emitted
    // ---------------------------------------------------------------------

    it('emits usage from every Finished event that has usageMetadata', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 50,
              },
            },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done.' },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: {
                promptTokenCount: 200,
                candidatesTokenCount: 75,
              },
            },
          },
        ],
      ]);

      const scheduler = makeScheduler(async (reqs) =>
        reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      const usages = events.filter((e) => e.type === 'usage');
      expect(usages).toHaveLength(2);
      expect(usages[0].inputTokens).toBe(100);
      expect(usages[1].inputTokens).toBe(200);
    });

    // ---------------------------------------------------------------------
    // recordCompletedToolCalls is called on chat
    // ---------------------------------------------------------------------

    it('records completed tool calls on the chat', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const recordFn = vi.fn();
      let callIndex = 0;
      const client: GeminiClient = {
        sendMessageStream() {
          callIndex++;
          const events: ServerGeminiStreamEvent[][] = [
            [
              { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
              {
                type: GeminiEventType.ToolCallRequest,
                value: toolRequest,
              },
              {
                type: GeminiEventType.Finished,
                value: {
                  reason: FinishReason.STOP,
                  usageMetadata: undefined,
                },
              },
            ],
            [
              { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
              { type: GeminiEventType.Content, value: 'Done.' },
              {
                type: GeminiEventType.Finished,
                value: {
                  reason: FinishReason.STOP,
                  usageMetadata: undefined,
                },
              },
            ],
          ];
          const turnEvents = events[callIndex - 1] ?? [];
          async function* gen(): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
            for (const e of turnEvents) yield e;
            return {} as Turn;
          }
          return gen();
        },
        getChat: () => ({ recordCompletedToolCalls: recordFn }),
        getCurrentSequenceModel: () => 'gemini-2.5-pro',
      } as unknown as GeminiClient;

      const scheduler = makeScheduler(async (reqs) =>
        reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      await waitForStreamEnd(session);

      expect(recordFn).toHaveBeenCalledTimes(1);
      expect(recordFn).toHaveBeenCalledWith(
        'gemini-2.5-pro',
        expect.arrayContaining([
          expect.objectContaining({
            request: expect.objectContaining({ callId: 'c1' }),
          }),
        ]),
      );
    });

    // ---------------------------------------------------------------------
    // All streamIds are consistent
    // ---------------------------------------------------------------------

    it('all events share the same streamId', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async (reqs) =>
        reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 'consistent-id',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      for (const event of events) {
        expect(event.streamId).toBe('consistent-id');
      }
    });

    // ---------------------------------------------------------------------
    // All event IDs are unique
    // ---------------------------------------------------------------------

    it('all event IDs are unique', async () => {
      const toolRequest: ToolCallRequestInfo = {
        callId: 'c1',
        name: 'tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      };

      const client = makeAsyncClient([
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Text' },
          { type: GeminiEventType.ToolCallRequest, value: toolRequest },
          {
            type: GeminiEventType.Finished,
            value: {
              reason: FinishReason.STOP,
              usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
            },
          },
        ],
        [
          { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
          { type: GeminiEventType.Content, value: 'Done.' },
          {
            type: GeminiEventType.Finished,
            value: { reason: FinishReason.STOP, usageMetadata: undefined },
          },
        ],
      ]);

      const scheduler = makeScheduler(async (reqs) =>
        reqs.map(
          (req) =>
            ({
              status: CoreToolCallStatus.Success,
              request: req,
              response: {
                callId: req.callId,
                responseParts: [{ text: 'ok' }],
                resultDisplay: undefined,
                error: undefined,
                errorType: undefined,
              },
              tool: {} as unknown as AnyDeclarativeTool,
              invocation: {} as unknown as AnyToolInvocation,
            }) as SuccessfulToolCall,
        ),
      );

      const session = new LegacyAgentSession({
        client,
        scheduler,
        config: makeConfig(),
        promptId: 'p1',
        streamId: 's1',
      });

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      const events = await waitForStreamEnd(session);

      const ids = events.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
