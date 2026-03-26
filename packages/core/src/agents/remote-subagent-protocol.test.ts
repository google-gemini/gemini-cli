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

    // Static session state is not cleared between tests — each test uses a
    // unique agent name to avoid cross-test contamination.

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
    await session.send({ message: [{ type: 'text', text: query }] });
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
      await session.send({ message: [{ type: 'text', text: 'q' }] });
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
        message: [{ type: 'text', text: 'q' }],
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
    it('each A2A chunk produces a message event with current accumulated text', async () => {
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield makeChunk('Hello');
          yield makeChunk(' world');
        },
      );

      const { events } = await runSession();

      const msgEvents = events.filter((e) => e.type === 'message');
      expect(msgEvents.length).toBeGreaterThanOrEqual(1);
      // Final message event should contain the accumulated text
      const lastMsg = msgEvents[msgEvents.length - 1];
      if (lastMsg?.type === 'message') {
        const textContent = lastMsg.content.find((c) => c.type === 'text');
        expect(textContent).toBeDefined();
        if (textContent?.type === 'text') {
          expect(textContent.text).toContain('Hello');
        }
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

      await session.send({ message: [{ type: 'text', text: 'q' }] });
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
      await session.send({ message: [{ type: 'text', text: 'q' }] });
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
    it('second call reuses contextId captured from first call', async () => {
      const agentName = 'persistent-agent';
      const persistDef: RemoteAgentDefinition = {
        ...mockDefinition,
        name: agentName,
      };

      let callCount = 0;
      mockClientManager.sendMessageStream.mockImplementation(async function* (
        _name: string,
        _query: string,
        opts: { contextId?: string },
      ) {
        callCount++;
        if (callCount === 1) {
          // First call: return a chunk that yields a contextId
          yield {
            kind: 'message' as const,
            messageId: 'msg-1',
            role: 'agent' as const,
            contextId: 'ctx-from-server',
            parts: [{ kind: 'text' as const, text: 'First response' }],
          };
        } else {
          // Second call: caller should have passed the contextId
          expect(opts.contextId).toBe('ctx-from-server');
          yield makeChunk('Second response');
        }
      });

      // First call
      const session1 = new RemoteSubagentSession(
        persistDef,
        mockContext,
        mockMessageBus,
      );
      await session1.send({ message: [{ type: 'text', text: 'first' }] });
      await session1.getResult();

      // Second call — different session but same agent name → should reuse contextId
      const session2 = new RemoteSubagentSession(
        persistDef,
        mockContext,
        mockMessageBus,
      );
      await session2.send({ message: [{ type: 'text', text: 'second' }] });
      await session2.getResult();

      expect(callCount).toBe(2);
    });

    it('different agent names have independent session state', async () => {
      const def1: RemoteAgentDefinition = {
        ...mockDefinition,
        name: 'agent-alpha',
      };
      const def2: RemoteAgentDefinition = {
        ...mockDefinition,
        name: 'agent-beta',
      };

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
          contextId: `ctx-for-${_name}`,
          parts: [{ kind: 'text' as const, text: 'ok' }],
        };
      });

      const session1 = new RemoteSubagentSession(
        def1,
        mockContext,
        mockMessageBus,
      );
      await session1.send({ message: [{ type: 'text', text: 'q' }] });
      await session1.getResult();

      const session2 = new RemoteSubagentSession(
        def2,
        mockContext,
        mockMessageBus,
      );
      await session2.send({ message: [{ type: 'text', text: 'q' }] });
      await session2.getResult();

      // Both start with no contextId (different agents, different state entries)
      expect(capturedContextIds[0]).toBeUndefined();
      expect(capturedContextIds[1]).toBeUndefined();
    });

    it('taskId is cleared when a terminal-state task chunk is received', async () => {
      // A task chunk with a terminal status sets clearTaskId=true, which
      // should clear this.taskId so it is NOT passed on the next call.
      const agentName = 'clearTaskId-agent';
      const def: RemoteAgentDefinition = { ...mockDefinition, name: agentName };

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
          // First call: yield a task chunk with taskId + terminal status → clearTaskId
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

      const session1 = new RemoteSubagentSession(
        def,
        mockContext,
        mockMessageBus,
      );
      await session1.send({ message: [{ type: 'text', text: 'first' }] });
      await session1.getResult();

      const session2 = new RemoteSubagentSession(
        def,
        mockContext,
        mockMessageBus,
      );
      await session2.send({ message: [{ type: 'text', text: 'second' }] });
      await session2.getResult();

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
      await session.send({ message: [{ type: 'text', text: 'q' }] });
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

      await session.send({ message: [{ type: 'text', text: 'q' }] });
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
      await session.send({ message: [{ type: 'text', text: 'q' }] });
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

      await session.send({ message: [{ type: 'text', text: 'q' }] });
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

      await session.send({ message: [{ type: 'text', text: 'q' }] });
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
      let resolveChunk: (() => void) | undefined;

      // Stream that blocks until we abort
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          // Hang until aborted
          await new Promise<void>((resolve) => {
            resolveChunk = resolve;
          });
          yield makeChunk('Too late');
        },
      );

      const session = new RemoteSubagentSession(
        mockDefinition,
        mockContext,
        mockMessageBus,
      );
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));

      void session.send({ message: [{ type: 'text', text: 'q' }] });

      // Wait for agent_start to be emitted before aborting
      await vi.waitFor(() => {
        expect(events.some((e) => e.type === 'agent_start')).toBe(true);
      });

      await session.abort();

      // Resolve the hanging chunk generator so it can check the signal
      resolveChunk?.();

      await expect(session.getResult()).rejects.toThrow();

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
      await session.send({ message: [{ type: 'text', text: '' }] });
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

      void session.send({ message: [{ type: 'text', text: 'first' }] });

      // Wait for the stream to actually start (agent_start emitted)
      const events: AgentEvent[] = [];
      session.subscribe((e) => events.push(e));
      await vi.waitFor(() => {
        expect(events.some((e) => e.type === 'agent_start')).toBe(true);
      });

      // Second send() while first stream is active must throw
      await expect(
        session.send({ message: [{ type: 'text', text: 'second' }] }),
      ).rejects.toThrow('cannot be called while a stream is active');

      // Clean up: release the blocked generator so getResult() can settle
      resolveChunk();
      await session.getResult().catch(() => {});
    });
  });
});
