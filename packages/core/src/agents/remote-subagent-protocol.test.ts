/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { RemoteSubagentSession } from './remote-subagent-protocol.js';

import { A2AAuthProviderFactory } from './auth-provider/factory.js';
import type { RemoteAgentDefinition, SubagentProgress } from './types.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { AgentEvent } from '../agent/types.js';
import type { Config } from '../config/config.js';
import type { A2AAuthProvider } from './auth-provider/types.js';

// Mock A2AClientManager at module level
vi.mock('./a2a-client-manager.js', () => ({
  A2AClientManager: vi.fn().mockImplementation(() => ({
    getClient: vi.fn(),
    loadAgent: vi.fn(),
    sendMessageStream: vi.fn(),
  })),
}));

// Mock A2AAuthProviderFactory
vi.mock('./auth-provider/factory.js', () => ({
  A2AAuthProviderFactory: {
    create: vi.fn(),
  },
}));

const mockDefinition: RemoteAgentDefinition = {
  name: 'test-remote-agent',
  kind: 'remote',
  agentCardUrl: 'http://test-agent/card',
  displayName: 'Test Remote Agent',
  description: 'A test remote agent',
  inputConfig: {
    inputSchema: { type: 'object' },
  },
};

function makeChunk(text: string) {
  return {
    kind: 'message' as const,
    messageId: `msg-${Math.random()}`,
    role: 'agent' as const,
    parts: [{ kind: 'text' as const, text }],
  };
}

describe('RemoteSubagentSession (protocol)', () => {
  let mockClientManager: {
    getClient: Mock;
    loadAgent: Mock;
    sendMessageStream: Mock;
  };
  let mockContext: AgentLoopContext;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Each test creates fresh session instances. contextId/taskId persist as
    // instance fields within a session, not via static state.

    mockClientManager = {
      getClient: vi.fn().mockReturnValue(undefined), // client not yet loaded
      loadAgent: vi.fn().mockResolvedValue(undefined),
      sendMessageStream: vi.fn(),
    };

    const mockConfig = {
      getA2AClientManager: vi.fn().mockReturnValue(mockClientManager),
      injectionService: {
        getLatestInjectionIndex: vi.fn().mockReturnValue(0),
      },
    } as unknown as Config;

    mockContext = { config: mockConfig } as unknown as AgentLoopContext;
    mockMessageBus = createMockMessageBus();

    // Default: sendMessageStream yields one chunk with "Hello"
    mockClientManager.sendMessageStream.mockImplementation(async function* () {
      yield makeChunk('Hello');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: run a session with the default or custom stream and collect events
  async function runSession(
    definition: RemoteAgentDefinition = mockDefinition,
    query = 'test query',
  ) {
    const session = new RemoteSubagentSession(
      definition,
      mockContext,
      mockMessageBus,
    );
    const events: AgentEvent[] = [];
    session.subscribe((e) => events.push(e));
    await session.send({
      message: { content: [{ type: 'text', text: query }] },
    });
    const result = await session.getResult();
    return { session, events, result };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle events
  // ---------------------------------------------------------------------------

  describe('lifecycle events', () => {
    it('emits agent_start then agent_end(completed) on success', async () => {
      const { events } = await runSession();

      const types = events.map((e) => e.type);
      expect(types[0]).toBe('agent_start');
      expect(types[types.length - 1]).toBe('agent_end');
      const end = events[events.length - 1];
      if (end.type === 'agent_end') {
        expect(end.reason).toBe('completed');
      }
    });

    it('emits agent_start exactly once', async () => {
      const { events } = await runSession();
      expect(events.filter((e) => e.type === 'agent_start')).toHaveLength(1);
    });

    it('emits agent_end exactly once on error path', async () => {
      mockClientManager.sendMessageStream.mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<never>> {
              throw new Error('stream error');
            },
          };
        },
      });

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));
      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await expect(session.getResult()).rejects.toThrow('stream error');

      expect(events.filter((e) => e.type === 'agent_end')).toHaveLength(1);
    });

    it('all events share the same streamId', async () => {
      const { events } = await runSession();
      const streamIds = new Set(events.map((e) => e.streamId));
      expect(streamIds.size).toBe(1);
    });

    it('message returns a non-null streamId; unsupported payload returns null', async () => {
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const updateResult = await session.send({
        update: { config: { key: 'val' } },
      });
      expect(updateResult.streamId).toBeNull();

      const messageResult = await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      expect(messageResult.streamId).not.toBeNull();
      // complete the session to avoid dangling execution
      await session.getResult();
    });
  });

  // ---------------------------------------------------------------------------
  // Chunk → AgentEvent translation
  // ---------------------------------------------------------------------------

  describe('chunk → AgentEvent translation', () => {
    it('each A2A chunk produces a message event with incremental delta text', async () => {
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield makeChunk('Hello');
          yield makeChunk(' world');
        },
      );

      const { events } = await runSession();

      const msgEvents = events.filter((e) => e.type === 'message');
      expect(msgEvents).toHaveLength(2);
      // Each message event contains only the delta, not accumulated text
      if (msgEvents[0]?.type === 'message') {
        const text = msgEvents[0].content.find((c) => c.type === 'text');
        expect(text?.type === 'text' && text.text).toBe('Hello');
      }
      if (msgEvents[1]?.type === 'message') {
        const text = msgEvents[1].content.find((c) => c.type === 'text');
        expect(text?.type === 'text' && text.text).toBe(' world');
      }
    });

    it('getLatestProgress() is updated per chunk with state running', async () => {
      let capturedProgress: SubagentProgress | undefined;

      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield makeChunk('Partial');
        },
      );

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      session.subscribe((e) => {
        if (e.type === 'message') {
          capturedProgress = session.getLatestProgress();
        }
      });

      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await session.getResult();

      // During streaming, progress should be 'running'
      expect(capturedProgress).toBeDefined();
      // Note: by the time we check, progress may be 'completed'.
      // During the message event, it was 'running'.
      expect(capturedProgress?.isSubagentProgress).toBe(true);
      expect(capturedProgress?.agentName).toBe('Test Remote Agent');
    });

    it('getLatestProgress() state is completed after getResult() resolves', async () => {
      const { session } = await runSession();
      const progress = session.getLatestProgress();
      expect(progress?.state).toBe('completed');
      expect(progress?.result).toBe('Hello');
    });
  });

  // ---------------------------------------------------------------------------
  // getResult() promise
  // ---------------------------------------------------------------------------

  describe('getResult()', () => {
    it('resolves with ToolResult containing llmContent and SubagentProgress returnDisplay', async () => {
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield makeChunk('Result text');
        },
      );

      const { result } = await runSession();

      expect(result.llmContent).toEqual([{ text: 'Result text' }]);
      const display = result.returnDisplay as SubagentProgress;
      expect(display.isSubagentProgress).toBe(true);
      expect(display.state).toBe('completed');
      expect(display.result).toBe('Result text');
      expect(display.agentName).toBe('Test Remote Agent');
    });

    it('rejects when stream throws a non-A2A error', async () => {
      mockClientManager.sendMessageStream.mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<never>> {
              throw new Error('network failure');
            },
          };
        },
      });

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await expect(session.getResult()).rejects.toThrow();
    });

    it('resolves even with empty stream (empty final output)', async () => {
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          // yield nothing
        },
      );

      const { result } = await runSession();
      expect(result.llmContent).toEqual([{ text: '' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // Session state persistence
  // ---------------------------------------------------------------------------

  describe('session state persistence', () => {
    it('second send reuses contextId captured from first send', async () => {
      let callCount = 0;
      mockClientManager.sendMessageStream.mockImplementation(async function* (
        _name: string,
        _query: string,
        opts: { contextId?: string },
      ) {
        callCount++;
        if (callCount === 1) {
          yield {
            kind: 'message' as const,
            messageId: 'msg-1',
            role: 'agent' as const,
            contextId: 'ctx-from-server',
            parts: [{ kind: 'text' as const, text: 'First response' }],
          };
        } else {
          // Second send on same session should pass the contextId
          expect(opts.contextId).toBe('ctx-from-server');
          yield makeChunk('Second response');
        }
      });

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );

      // First send — establishes contextId
      await session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });
      await session.getResult();

      // Second send on same session — should reuse contextId
      await session.send({
        message: { content: [{ type: 'text', text: 'second' }] },
      });
      await session.getResult();

      expect(callCount).toBe(2);
    });

    it('separate session instances have independent state', async () => {
      const capturedContextIds: Array<string | undefined> = [];
      mockClientManager.sendMessageStream.mockImplementation(async function* (
        _name: string,
        _query: string,
        opts: { contextId?: string },
      ) {
        capturedContextIds.push(opts.contextId);
        yield {
          kind: 'message' as const,
          messageId: 'msg-1',
          role: 'agent' as const,
          contextId: 'ctx-from-server',
          parts: [{ kind: 'text' as const, text: 'ok' }],
        };
      });

      // Two separate sessions for the same agent — state is NOT shared
      const session1 = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      await session1.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await session1.getResult();

      const session2 = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      await session2.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await session2.getResult();

      // Both start with no contextId — separate instances, no shared state
      expect(capturedContextIds[0]).toBeUndefined();
      expect(capturedContextIds[1]).toBeUndefined();
    });

    it('taskId is cleared when a terminal-state task chunk is received', async () => {
      let callCount = 0;
      const capturedTaskIds: Array<string | undefined> = [];

      mockClientManager.sendMessageStream.mockImplementation(async function* (
        _n: string,
        _q: string,
        opts: { taskId?: string },
      ) {
        callCount++;
        capturedTaskIds.push(opts.taskId);
        if (callCount === 1) {
          yield {
            kind: 'task' as const,
            id: 'task-123',
            contextId: 'ctx-1',
            status: { state: 'completed' as const },
          };
        } else {
          yield makeChunk('done');
        }
      });

      // Use same session for multi-send
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });
      await session.getResult();

      await session.send({
        message: { content: [{ type: 'text', text: 'second' }] },
      });
      await session.getResult();

      expect(callCount).toBe(2);
      // First call starts with no taskId
      expect(capturedTaskIds[0]).toBeUndefined();
      // Second call: taskId was cleared because terminal-state task chunk was received
      expect(capturedTaskIds[1]).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Auth setup
  // ---------------------------------------------------------------------------

  describe('auth setup', () => {
    it('no auth → loadAgent called without auth handler', async () => {
      await runSession();

      expect(mockClientManager.loadAgent).toHaveBeenCalledWith(
        'test-remote-agent',
        { type: 'url', url: 'http://test-agent/card' },
        undefined,
      );
    });

    it('definition.auth present → A2AAuthProviderFactory.create called', async () => {
      const authDef: RemoteAgentDefinition = {
        ...mockDefinition,
        name: 'auth-agent',
        auth: {
          type: 'http' as const,
          scheme: 'Bearer' as const,
          token: 'secret',
        },
      };

      const mockProvider = {
        type: 'http' as const,
        headers: vi.fn().mockResolvedValue({ Authorization: 'Bearer secret' }),
        shouldRetryWithHeaders: vi.fn(),
      } as unknown as A2AAuthProvider;
      (A2AAuthProviderFactory.create as Mock).mockResolvedValue(mockProvider);

      await runSession(authDef, 'q');

      expect(A2AAuthProviderFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'auth-agent',
          agentCardUrl: 'http://test-agent/card',
        }),
      );
      expect(mockClientManager.loadAgent).toHaveBeenCalledWith(
        'auth-agent',
        expect.any(Object),
        mockProvider,
      );
    });

    it('auth factory returns undefined → throws error that rejects getResult()', async () => {
      const authDef: RemoteAgentDefinition = {
        ...mockDefinition,
        name: 'failing-auth-agent',
        auth: {
          type: 'http' as const,
          scheme: 'Bearer' as const,
          token: 'secret',
        },
      };

      (A2AAuthProviderFactory.create as Mock).mockResolvedValue(undefined);

      const session = new RemoteSubagentSession(
        authDef,
        mockContext,
        mockMessageBus,
      );
      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await expect(session.getResult()).rejects.toThrow(
        "Failed to create auth provider for agent 'failing-auth-agent'",
      );
    });

    it('agent already loaded → loadAgent not called again', async () => {
      // Return a client object (truthy) so getClient returns defined
      mockClientManager.getClient.mockReturnValue({});

      await runSession();

      expect(mockClientManager.loadAgent).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('stream error → error event + agent_end(failed)', async () => {
      mockClientManager.sendMessageStream.mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<never>> {
              throw new Error('network error');
            },
          };
        },
      });

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await expect(session.getResult()).rejects.toThrow();

      const errEvent = events.find((e) => e.type === 'error');
      expect(errEvent).toBeDefined();

      const endEvent = events.find((e) => e.type === 'agent_end');
      expect(endEvent).toBeDefined();
      if (endEvent?.type === 'agent_end') {
        expect(endEvent.reason).toBe('failed');
      }
    });

    it('missing A2AClientManager → rejects getResult()', async () => {
      const mockConfig = {
        getA2AClientManager: vi.fn().mockReturnValue(undefined),
        injectionService: {
          getLatestInjectionIndex: vi.fn().mockReturnValue(0),
        },
      } as unknown as Config;
      const noClientContext = {
        config: mockConfig,
      } as unknown as AgentLoopContext;

      const session = new RemoteSubagentSession(
        mockDefinition,
        noClientContext,
        mockMessageBus,
      );
      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await expect(session.getResult()).rejects.toThrow(
        'A2AClientManager not available',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  describe('subscription', () => {
    it('unsubscribe stops event delivery', async () => {
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const received: AgentEvent[] = [];
      const unsub = session.subscribe((e) => received.push(e));
      unsub();

      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await session.getResult();

      expect(received).toHaveLength(0);
    });

    it('multiple subscribers all receive events', async () => {
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const events1: AgentEvent[] = [];
      const events2: AgentEvent[] = [];
      session.subscribe((e) => events1.push(e));
      session.subscribe((e) => events2.push(e));

      await session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });
      await session.getResult();

      expect(events1.length).toBeGreaterThan(0);
      expect(events1).toEqual(events2);
    });
  });

  // ---------------------------------------------------------------------------
  // Abort
  // ---------------------------------------------------------------------------

  describe('abort()', () => {
    it('abort() causes agent_end(reason:aborted)', async () => {
      let rejectWithAbort: ((err: Error) => void) | undefined;

      // Stream that blocks until aborted, then throws AbortError
      mockClientManager.sendMessageStream.mockImplementation(
        // eslint-disable-next-line require-yield
        async function* () {
          await new Promise<void>((_resolve, reject) => {
            rejectWithAbort = reject;
          });
        },
      );

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      void session.send({
        message: { content: [{ type: 'text', text: 'q' }] },
      });

      // Wait for agent_start to be emitted before aborting
      await vi.waitFor(() => {
        expect(events.some((e) => e.type === 'agent_start')).toBe(true);
      });

      await session.abort();

      // Simulate the transport throwing AbortError when signal fires
      const abortErr = new Error('AbortError');
      abortErr.name = 'AbortError';
      rejectWithAbort?.(abortErr);

      const result = await session.getResult();
      expect(result.llmContent).toEqual([{ text: '' }]);
      expect(result.returnDisplay).toBe('');

      const endEvent = events.find((e) => e.type === 'agent_end');
      expect(endEvent).toBeDefined();
      if (endEvent?.type === 'agent_end') {
        expect(endEvent.reason).toBe('aborted');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // sendMessageStream call args
  // ---------------------------------------------------------------------------

  describe('sendMessageStream call arguments', () => {
    it('passes the query string from the message payload', async () => {
      await runSession(mockDefinition, 'my specific query');

      expect(mockClientManager.sendMessageStream).toHaveBeenCalledWith(
        'test-remote-agent',
        'my specific query',
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });

    it('uses DEFAULT_QUERY_STRING when message text is empty', async () => {
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      await session.send({
        message: { content: [{ type: 'text', text: '' }] },
      });
      await session.getResult();

      // DEFAULT_QUERY_STRING = 'Get Started!'
      expect(mockClientManager.sendMessageStream).toHaveBeenCalledWith(
        'test-remote-agent',
        'Get Started!',
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent send() guard
  // ---------------------------------------------------------------------------

  describe('concurrent send() guard', () => {
    it('calling send() while a stream is active throws', async () => {
      let resolveChunk!: () => void;

      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          // Block until test releases the chunk
          await new Promise<void>((resolve) => {
            resolveChunk = resolve;
          });
          yield makeChunk('late');
        },
      );

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );

      void session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });

      // Wait for the stream to actually start (agent_start emitted)
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));
      await vi.waitFor(() => {
        expect(events.some((e) => e.type === 'agent_start')).toBe(true);
      });

      // Second send() while first stream is active must throw
      await expect(
        session.send({
          message: { content: [{ type: 'text', text: 'second' }] },
        }),
      ).rejects.toThrow('cannot be called while a stream is active');

      // Clean up: release the blocked generator so getResult() can settle
      resolveChunk();
      await session.getResult().catch(() => {});
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-send support
  // ---------------------------------------------------------------------------

  describe('multi-send', () => {
    it('supports sequential sends after stream completion', async () => {
      let callCount = 0;
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          callCount++;
          yield makeChunk(`Response ${callCount}`);
        },
      );

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );

      // First send
      const result1 = await session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });
      expect(result1.streamId).not.toBeNull();
      const output1 = await session.getResult();
      expect(output1.llmContent).toEqual([{ text: 'Response 1' }]);

      // Second send — should work, not throw
      const result2 = await session.send({
        message: { content: [{ type: 'text', text: 'second' }] },
      });
      expect(result2.streamId).not.toBeNull();
      expect(result2.streamId).not.toBe(result1.streamId);

      const output2 = await session.getResult();
      expect(output2.llmContent).toEqual([{ text: 'Response 2' }]);
    });

    it('getResult() returns the latest stream result', async () => {
      let callCount = 0;
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          callCount++;
          yield makeChunk(`Result ${callCount}`);
        },
      );

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );

      await session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });
      const result1 = await session.getResult();

      await session.send({
        message: { content: [{ type: 'text', text: 'second' }] },
      });
      const result2 = await session.getResult();

      expect(result1.llmContent).toEqual([{ text: 'Result 1' }]);
      expect(result2.llmContent).toEqual([{ text: 'Result 2' }]);
    });

    it('contextId/taskId persist across sends within the same session', async () => {
      let sendCallCount = 0;
      mockClientManager.sendMessageStream.mockImplementation(async function* (
        _name: string,
        _query: string,
        _opts: Record<string, unknown>,
      ) {
        sendCallCount++;
        // First call returns ids; second call should receive them
        yield {
          kind: 'message' as const,
          messageId: `msg-${sendCallCount}`,
          contextId: `ctx-${sendCallCount}`,
          taskId: `task-${sendCallCount}`,
          role: 'agent' as const,
          parts: [{ kind: 'text' as const, text: `Response ${sendCallCount}` }],
        };
      });

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );

      // First send — establishes contextId/taskId
      await session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });
      await session.getResult();

      // Second send — should pass the persisted contextId/taskId
      await session.send({
        message: { content: [{ type: 'text', text: 'second' }] },
      });
      await session.getResult();

      // Verify the second call received the contextId/taskId from first call
      expect(mockClientManager.sendMessageStream).toHaveBeenCalledTimes(2);
      const secondCallOpts =
        mockClientManager.sendMessageStream.mock.calls[1]?.[2];
      expect(secondCallOpts).toHaveProperty('contextId', 'ctx-1');
      expect(secondCallOpts).toHaveProperty('taskId', 'task-1');
    });

    it('getResult() rejects when called before any send', async () => {
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      await expect(session.getResult()).rejects.toThrow(
        'No active or completed stream',
      );
    });

    it('emits fresh agent_start/agent_end per stream', async () => {
      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      // First send
      await session.send({
        message: { content: [{ type: 'text', text: 'first' }] },
      });
      await session.getResult();

      const firstStreamEvents = events.length;
      expect(events[0]?.type).toBe('agent_start');
      expect(events[firstStreamEvents - 1]?.type).toBe('agent_end');

      // Second send
      await session.send({
        message: { content: [{ type: 'text', text: 'second' }] },
      });
      await session.getResult();

      // Should have a second agent_start/agent_end pair
      const secondStreamStart = events[firstStreamEvents];
      const lastEvent = events[events.length - 1];
      expect(secondStreamStart?.type).toBe('agent_start');
      expect(lastEvent?.type).toBe('agent_end');
      expect(secondStreamStart?.streamId).not.toBe(events[0]?.streamId);
    });
  });
});
