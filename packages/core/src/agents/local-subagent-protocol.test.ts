/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalSubagentSession } from './local-subagent-protocol.js';
import { LocalAgentExecutor } from './local-executor.js';
import {
  AgentTerminateMode,
  type LocalAgentDefinition,
  type SubagentActivityEvent,
} from './types.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { AgentEvent } from '../agent/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { z } from 'zod';
import type { Mocked } from 'vitest';

vi.mock('./local-executor.js');

const MockLocalAgentExecutor = vi.mocked(LocalAgentExecutor);

// Captures the onActivity callback passed to LocalAgentExecutor.create().
// Set via create.mockImplementation in beforeEach to avoid mock.calls index fragility.
let capturedOnActivity: ((activity: SubagentActivityEvent) => void) | undefined;

const testDefinition: LocalAgentDefinition = {
  kind: 'local',
  name: 'TestProtocolAgent',
  description: 'A test agent for protocol tests.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        priority: { type: 'number' },
      },
    },
  },
  modelConfig: { model: 'test', generateContentConfig: {} },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'test' },
};

const GOAL_OUTPUT = {
  result: 'Analysis complete.',
  terminate_reason: AgentTerminateMode.GOAL,
};

describe('LocalSubagentSession (protocol)', () => {
  let mockContext: AgentLoopContext;
  let mockMessageBus: MessageBus;
  let mockExecutorInstance: Mocked<LocalAgentExecutor<z.ZodUnknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnActivity = undefined;

    mockContext = makeFakeConfig() as unknown as AgentLoopContext;
    mockMessageBus = createMockMessageBus();

    mockExecutorInstance = {
      run: vi.fn().mockResolvedValue(GOAL_OUTPUT),
      definition: testDefinition,
    } as unknown as Mocked<LocalAgentExecutor<z.ZodUnknown>>;

    // Use mockImplementation (not mockResolvedValue) so we can capture onActivity.
    MockLocalAgentExecutor.create.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_def: any, _ctx: any, onActivity: any) => {
        capturedOnActivity = onActivity;

        return mockExecutorInstance as unknown as LocalAgentExecutor<z.ZodTypeAny>;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Lifecycle events
  // ---------------------------------------------------------------------------

  describe('lifecycle events', () => {
    it('emits agent_start then agent_end(completed) for a GOAL run', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      await session.send({ message: [{ type: 'text', text: 'query' }] });
      await session.getResult();

      expect(events[0].type).toBe('agent_start');
      expect(events[events.length - 1].type).toBe('agent_end');
      const endEvent = events[events.length - 1];
      if (endEvent.type === 'agent_end') {
        expect(endEvent.reason).toBe('completed');
      }
    });

    it('emits agent_start exactly once even if ensureAgentStart called twice internally', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      await session.send({ message: [{ type: 'text', text: 'query' }] });
      await session.getResult();

      const startEvents = events.filter((e) => e.type === 'agent_start');
      expect(startEvents).toHaveLength(1);
    });

    it('emits agent_end exactly once on error path', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      mockExecutorInstance.run.mockRejectedValue(new Error('executor failed'));

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      await session.send({ message: [{ type: 'text', text: 'query' }] });
      await expect(session.getResult()).rejects.toThrow('executor failed');

      const endEvents = events.filter((e) => e.type === 'agent_end');
      expect(endEvents).toHaveLength(1);
    });

    it('all events share the same streamId', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      await session.send({ message: [{ type: 'text', text: 'query' }] });
      await session.getResult();

      const streamIds = new Set(events.map((e) => e.streamId));
      expect(streamIds.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Config buffering (update + message pattern)
  // ---------------------------------------------------------------------------

  describe('config buffering', () => {
    it('merges buffered config with message query', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({
        update: { config: { task: 'analyze', priority: 5 } },
      });
      await session.send({ message: [{ type: 'text', text: 'my query' }] });
      await session.getResult();

      expect(mockExecutorInstance.run).toHaveBeenCalledWith(
        { task: 'analyze', priority: 5, query: 'my query' },
        expect.any(AbortSignal),
      );
    });

    it('omits query key when message text is empty', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({ update: { config: { task: 'no-query-task' } } });
      await session.send({ message: [{ type: 'text', text: '' }] });
      await session.getResult();

      const callArgs = mockExecutorInstance.run.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('query');
      expect(callArgs).toEqual({ task: 'no-query-task' });
    });

    it('sends only query when no prior update', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({ message: [{ type: 'text', text: 'just a query' }] });
      await session.getResult();

      expect(mockExecutorInstance.run).toHaveBeenCalledWith(
        { query: 'just a query' },
        expect.any(AbortSignal),
      );
    });

    it('multiple update calls are merged', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({ update: { config: { field1: 'a' } } });
      await session.send({ update: { config: { field2: 'b' } } });
      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();

      expect(mockExecutorInstance.run).toHaveBeenCalledWith(
        { field1: 'a', field2: 'b', query: 'q' },
        expect.any(AbortSignal),
      );
    });

    it('update returns streamId: null; message returns a streamId', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const updateResult = await session.send({ update: { config: {} } });
      expect(updateResult.streamId).toBeNull();

      const messageResult = await session.send({
        message: [{ type: 'text', text: 'q' }],
      });
      expect(messageResult.streamId).not.toBeNull();
      expect(typeof messageResult.streamId).toBe('string');

      // Await completion to prevent dangling execution affecting subsequent tests
      await session.getResult();
    });
  });

  // ---------------------------------------------------------------------------
  // Activity translation
  // ---------------------------------------------------------------------------

  describe('activity translation', () => {
    function makeSession() {
      const activityEvents: SubagentActivityEvent[] = [];
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );
      return { session, activityEvents };
    }

    async function runWithActivities(
      session: LocalSubagentSession,
      activities: SubagentActivityEvent[],
    ) {
      mockExecutorInstance.run.mockImplementation(async () => {
        // capturedOnActivity is set by the create.mockImplementation in beforeEach
        // and updated whenever create() is called. By the time run() is called,
        // capturedOnActivity holds the onActivity closure for the most-recently
        // created executor — which is the one associated with this session.
        for (const act of activities) {
          capturedOnActivity?.(act);
        }
        return GOAL_OUTPUT;
      });

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));
      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();
      return events;
    }

    it('THOUGHT_CHUNK → message event with thought content', async () => {
      const { session } = makeSession();
      const events = await runWithActivities(session, [
        {
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'THOUGHT_CHUNK',
          data: { text: 'I am thinking...' },
        },
      ]);

      const msgEvent = events.find((e) => e.type === 'message');
      expect(msgEvent).toBeDefined();
      if (msgEvent?.type === 'message') {
        expect(msgEvent.role).toBe('agent');
        expect(msgEvent.content).toContainEqual({
          type: 'thought',
          thought: 'I am thinking...',
        });
      }
    });

    it('TOOL_CALL_START → tool_request event', async () => {
      const { session } = makeSession();
      const events = await runWithActivities(session, [
        {
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'TOOL_CALL_START',
          data: { callId: 'call-123', name: 'read_file', args: { path: '/a' } },
        },
      ]);

      const reqEvent = events.find((e) => e.type === 'tool_request');
      expect(reqEvent).toBeDefined();
      if (reqEvent?.type === 'tool_request') {
        expect(reqEvent.requestId).toBe('call-123');
        expect(reqEvent.name).toBe('read_file');
        expect(reqEvent.args).toEqual({ path: '/a' });
      }
    });

    it('TOOL_CALL_END → tool_response event', async () => {
      const { session } = makeSession();
      const events = await runWithActivities(session, [
        {
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'TOOL_CALL_END',
          data: { id: 'call-123', name: 'read_file', output: 'file contents' },
        },
      ]);

      const respEvent = events.find((e) => e.type === 'tool_response');
      expect(respEvent).toBeDefined();
      if (respEvent?.type === 'tool_response') {
        expect(respEvent.requestId).toBe('call-123');
        expect(respEvent.name).toBe('read_file');
        expect(respEvent.content).toContainEqual({
          type: 'text',
          text: 'file contents',
        });
      }
    });

    it('ERROR activity → error event with INTERNAL status, fatal: false', async () => {
      const { session } = makeSession();
      const events = await runWithActivities(session, [
        {
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'ERROR',
          data: { error: 'something went wrong' },
        },
      ]);

      const errEvent = events.find((e) => e.type === 'error');
      expect(errEvent).toBeDefined();
      if (errEvent?.type === 'error') {
        expect(errEvent.status).toBe('INTERNAL');
        expect(errEvent.message).toBe('something went wrong');
        expect(errEvent.fatal).toBe(false);
      }
    });

    it('unknown activity type → no events emitted', async () => {
      const { session } = makeSession();
      const events = await runWithActivities(session, [
        {
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: 'UNKNOWN_TYPE' as any,
          data: {},
        },
      ]);

      // Only agent_start and agent_end should be present
      const nonLifecycle = events.filter(
        (e) => e.type !== 'agent_start' && e.type !== 'agent_end',
      );
      expect(nonLifecycle).toHaveLength(0);
    });

    it('TOOL_CALL_START with non-object args defaults to {}', async () => {
      const { session } = makeSession();
      const events = await runWithActivities(session, [
        {
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'TOOL_CALL_START',
          data: { callId: 'x', name: 'tool', args: null },
        },
      ]);

      const reqEvent = events.find((e) => e.type === 'tool_request');
      if (reqEvent?.type === 'tool_request') {
        expect(reqEvent.args).toEqual({});
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getResult() promise
  // ---------------------------------------------------------------------------

  describe('getResult()', () => {
    it('resolves with OutputObject on GOAL termination', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      const output = await session.getResult();

      expect(output.result).toBe('Analysis complete.');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
    });

    it('rejects when executor throws', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      mockExecutorInstance.run.mockRejectedValue(new Error('executor error'));

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await expect(session.getResult()).rejects.toThrow('executor error');
    });
  });

  // ---------------------------------------------------------------------------
  // rawActivityCallback
  // ---------------------------------------------------------------------------

  describe('rawActivityCallback', () => {
    it('receives raw SubagentActivityEvent before AgentEvent translation', async () => {
      const rawActivities: SubagentActivityEvent[] = [];
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
        (activity) => rawActivities.push(activity),
      );

      const thoughtActivity: SubagentActivityEvent = {
        isSubagentActivityEvent: true,
        agentName: 'TestProtocolAgent',
        type: 'THOUGHT_CHUNK',
        data: { text: 'raw thought' },
      };

      mockExecutorInstance.run.mockImplementation(async () => {
        const onActivity = MockLocalAgentExecutor.create.mock.calls[0]?.[2];
        onActivity?.(thoughtActivity);
        return GOAL_OUTPUT;
      });

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();

      expect(rawActivities).toHaveLength(1);
      expect(rawActivities[0]).toBe(thoughtActivity);
    });

    it('is called before AgentEvent translation (raw arrives first)', async () => {
      const callOrder: string[] = [];

      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
        () => callOrder.push('raw'),
      );

      session.subscribe((e) => {
        if (e.type === 'message') callOrder.push('translated');
      });

      mockExecutorInstance.run.mockImplementation(async () => {
        const onActivity = MockLocalAgentExecutor.create.mock.calls[0]?.[2];
        onActivity?.({
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'THOUGHT_CHUNK',
          data: { text: 'thought' },
        });
        return GOAL_OUTPUT;
      });

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();

      expect(callOrder).toEqual(['raw', 'translated']);
    });

    it('is optional — no callback causes no error', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
        // no rawActivityCallback
      );

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await expect(session.getResult()).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  describe('subscription', () => {
    it('unsubscribe stops event delivery', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const received: AgentEvent[] = [];
      const unsub = session.subscribe((e) => received.push(e));
      unsub();

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();

      expect(received).toHaveLength(0);
    });

    it('multiple subscribers all receive events', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const received1: AgentEvent[] = [];
      const received2: AgentEvent[] = [];
      session.subscribe((e) => received1.push(e));
      session.subscribe((e) => received2.push(e));

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();

      expect(received1.length).toBeGreaterThan(0);
      expect(received1).toEqual(received2);
    });

    it('events array accumulates all emitted events', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({ message: [{ type: 'text', text: 'q' }] });
      await session.getResult();

      expect(session.events.length).toBeGreaterThanOrEqual(2); // at least agent_start + agent_end
      expect(session.events[0].type).toBe('agent_start');
    });
  });

  // ---------------------------------------------------------------------------
  // Terminate mode mapping
  // ---------------------------------------------------------------------------

  describe('terminate mode → StreamEndReason mapping', () => {
    const cases: Array<[AgentTerminateMode, string]> = [
      [AgentTerminateMode.GOAL, 'completed'],
      [AgentTerminateMode.TIMEOUT, 'max_time'],
      [AgentTerminateMode.MAX_TURNS, 'max_turns'],
      [AgentTerminateMode.ABORTED, 'aborted'],
      [AgentTerminateMode.ERROR, 'failed'],
      [AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL, 'failed'],
    ];

    for (const [terminateMode, expectedReason] of cases) {
      it(`${terminateMode} → agent_end(reason:'${expectedReason}')`, async () => {
        mockExecutorInstance.run.mockResolvedValue({
          result: 'done',
          terminate_reason: terminateMode,
        });

        const session = new LocalSubagentSession(
          testDefinition,
          mockContext,
          mockMessageBus,
        );

        const events: AgentEvent[] = [];
        session.subscribe((e) => events.push(e));

        await session.send({ message: [{ type: 'text', text: 'q' }] });
        await session.getResult().catch(() => {
          // ABORTED results in rejection — catch to let test complete
        });

        const endEvent = events.find((e) => e.type === 'agent_end');
        expect(endEvent).toBeDefined();
        if (endEvent?.type === 'agent_end') {
          expect(endEvent.reason).toBe(expectedReason);
        }
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Abort
  // ---------------------------------------------------------------------------

  describe('abort()', () => {
    it('abort() causes agent_end(reason:aborted)', async () => {
      // Make run() wait until aborted
      let abortSignal: AbortSignal | undefined;
      mockExecutorInstance.run.mockImplementation(
        (_params: unknown, signal: AbortSignal) => {
          abortSignal = signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              const err = new Error('AbortError');
              err.name = 'AbortError';
              reject(err);
            });
          });
        },
      );

      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      void session.send({ message: [{ type: 'text', text: 'q' }] });

      // Wait for executor to be created and run started
      await vi.waitFor(() => {
        expect(abortSignal).toBeDefined();
      });

      await session.abort();

      await expect(session.getResult()).rejects.toThrow();

      const endEvent = events.find((e) => e.type === 'agent_end');
      expect(endEvent).toBeDefined();
      if (endEvent?.type === 'agent_end') {
        expect(endEvent.reason).toBe('aborted');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Full event sequence
  // ---------------------------------------------------------------------------

  describe('full event sequence', () => {
    it('emits agent_start → message(thought) → tool_request → tool_response → agent_end in order', async () => {
      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      mockExecutorInstance.run.mockImplementation(async () => {
        const onActivity = MockLocalAgentExecutor.create.mock.calls[0]?.[2];
        onActivity?.({
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'THOUGHT_CHUNK',
          data: { text: 'thinking' },
        });
        onActivity?.({
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'TOOL_CALL_START',
          data: { callId: 'c1', name: 'tool', args: {} },
        });
        onActivity?.({
          isSubagentActivityEvent: true,
          agentName: 'TestProtocolAgent',
          type: 'TOOL_CALL_END',
          data: { id: 'c1', name: 'tool', output: 'result' },
        });
        return GOAL_OUTPUT;
      });

      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      await session.send({ message: [{ type: 'text', text: 'go' }] });
      await session.getResult();

      const types = events.map((e) => e.type);
      expect(types).toEqual([
        'agent_start',
        'message',
        'tool_request',
        'tool_response',
        'agent_end',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent send() guard
  // ---------------------------------------------------------------------------

  describe('concurrent send() guard', () => {
    it('calling send() while a stream is active throws', async () => {
      let abortSignal: AbortSignal | undefined;
      mockExecutorInstance.run.mockImplementation(
        (_params: unknown, signal: AbortSignal) => {
          abortSignal = signal;
          return new Promise((_resolve, reject) => {
            // Reject when aborted so getResult() can settle during cleanup
            signal.addEventListener('abort', () => {
              const err = new Error('AbortError');
              err.name = 'AbortError';
              reject(err);
            });
          });
        },
      );

      const session = new LocalSubagentSession(
        testDefinition,
        mockContext,
        mockMessageBus,
      );

      void session.send({ message: [{ type: 'text', text: 'first' }] });

      // Wait for execution to start
      await vi.waitFor(() => {
        expect(abortSignal).toBeDefined();
      });

      // Second send() while first stream is active must throw
      await expect(
        session.send({ message: [{ type: 'text', text: 'second' }] }),
      ).rejects.toThrow('cannot be called while a stream is active');

      // Clean up: abort to unblock the hanging executor
      await session.abort();
      await session.getResult().catch(() => {});
    });
  });
});
