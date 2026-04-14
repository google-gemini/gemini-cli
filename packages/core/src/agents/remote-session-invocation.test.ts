/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteSessionInvocation } from './remote-session-invocation.js';
import { RemoteSubagentSession } from './remote-subagent-protocol.js';
import type { RemoteAgentDefinition, SubagentProgress } from './types.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { Config } from '../config/config.js';
import type { ToolResult } from '../tools/tools.js';
import type { AgentEvent } from '../agent/types.js';

vi.mock('./remote-subagent-protocol.js');

const mockDefinition: RemoteAgentDefinition = {
  name: 'test-agent',
  kind: 'remote',
  agentCardUrl: 'http://test-agent/card',
  displayName: 'Test Agent',
  description: 'A test agent',
  inputConfig: { inputSchema: { type: 'object' } },
};

const mockMessageBus = createMockMessageBus();

interface MockSessionSetupOptions {
  result?: ToolResult;
  error?: Error;
  progress?: SubagentProgress;
  sessionState?: { contextId?: string; taskId?: string };
}

function setupMockSession(options: MockSessionSetupOptions = {}) {
  const {
    result = {
      llmContent: [{ text: 'done' }],
      returnDisplay: {
        isSubagentProgress: true,
        agentName: 'Test Agent',
        state: 'completed',
        result: 'done',
        recentActivity: [],
      } satisfies SubagentProgress,
    },
    error,
    progress,
    sessionState = {},
  } = options;

  const subscriberCallbacks: Array<(event: AgentEvent) => void> = [];

  const mockSession = {
    send: vi.fn().mockResolvedValue({ streamId: 'stream-1' }),
    getResult: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue(result),
    getLatestProgress: vi.fn().mockReturnValue(progress),
    getSessionState: vi.fn().mockReturnValue(sessionState),
    subscribe: vi.fn((cb: (event: AgentEvent) => void) => {
      subscriberCallbacks.push(cb);
      return vi.fn(); // unsubscribe
    }),
    abort: vi.fn(),
  };

  vi.mocked(RemoteSubagentSession).mockImplementation(
    () => mockSession as unknown as RemoteSubagentSession,
  );

  return {
    mockSession,
    subscriberCallbacks,
    /** Fire a message event through all subscribed callbacks. */
    emitEvent(event: AgentEvent) {
      for (const cb of subscriberCallbacks) {
        cb(event);
      }
    },
  };
}

describe('RemoteSessionInvocation', () => {
  let mockContext: AgentLoopContext;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockConfig = {
      getA2AClientManager: vi.fn().mockReturnValue({}),
      injectionService: {
        getLatestInjectionIndex: vi.fn().mockReturnValue(0),
      },
    } as unknown as Config;

    mockContext = { config: mockConfig } as unknown as AgentLoopContext;

    // Clear the static sessionState map between tests
    (
      RemoteSessionInvocation as unknown as {
        sessionState?: Map<string, unknown>;
      }
    ).sessionState?.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Constructor Validation
  // ---------------------------------------------------------------------------

  describe('Constructor Validation', () => {
    it('accepts valid input with string query', () => {
      expect(() => {
        new RemoteSessionInvocation(
          mockDefinition,
          mockContext,
          { query: 'hello' },
          mockMessageBus,
        );
      }).not.toThrow();
    });

    it('accepts missing query (defaults to "Get Started!")', () => {
      expect(() => {
        new RemoteSessionInvocation(
          mockDefinition,
          mockContext,
          {},
          mockMessageBus,
        );
      }).not.toThrow();
    });

    it('throws if query is not a string', () => {
      expect(() => {
        new RemoteSessionInvocation(
          mockDefinition,
          mockContext,
          { query: 123 },
          mockMessageBus,
        );
      }).toThrow("requires a string 'query' input");
    });

    it('throws if A2AClientManager is not available', () => {
      const noA2AConfig = {
        getA2AClientManager: vi.fn().mockReturnValue(undefined),
        injectionService: {
          getLatestInjectionIndex: vi.fn().mockReturnValue(0),
        },
      } as unknown as Config;
      const noA2AContext = {
        config: noA2AConfig,
      } as unknown as AgentLoopContext;

      expect(() => {
        new RemoteSessionInvocation(
          mockDefinition,
          noA2AContext,
          { query: 'hi' },
          mockMessageBus,
        );
      }).toThrow('A2AClientManager is not available');
    });
  });

  // ---------------------------------------------------------------------------
  // Execution Logic
  // ---------------------------------------------------------------------------

  describe('Execution Logic', () => {
    it('should create session and return result', async () => {
      const completedProgress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: 'Test Agent',
        state: 'completed',
        result: 'Agent output',
        recentActivity: [],
      };
      const expectedResult: ToolResult = {
        llmContent: [{ text: 'Agent output' }],
        returnDisplay: completedProgress,
      };

      setupMockSession({
        result: expectedResult,
        progress: completedProgress,
      });

      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'do stuff' },
        mockMessageBus,
      );

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(RemoteSubagentSession).toHaveBeenCalledOnce();
      expect(result).toBe(expectedResult);
    });

    it('should pass initial state from static map to session', async () => {
      const priorState = { contextId: 'ctx-42', taskId: 'task-42' };

      // Seed the static map before constructing the invocation
      (
        RemoteSessionInvocation as unknown as {
          sessionState: Map<string, unknown>;
        }
      ).sessionState.set('test-agent', priorState);

      setupMockSession();

      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      // Verify the session constructor received the prior state
      expect(RemoteSubagentSession).toHaveBeenCalledWith(
        mockDefinition,
        mockContext,
        mockMessageBus,
        priorState,
      );
    });

    it('should persist session state in finally block', async () => {
      const newState = { contextId: 'ctx-new', taskId: 'task-new' };
      setupMockSession({ sessionState: newState });

      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      // Verify the state was persisted in the static map
      const storedState = (
        RemoteSessionInvocation as unknown as {
          sessionState: Map<string, { contextId?: string; taskId?: string }>;
        }
      ).sessionState.get('test-agent');
      expect(storedState).toEqual(newState);
    });

    it('should persist session state across invocations', async () => {
      // First invocation returns state
      const firstState = { contextId: 'ctx-1', taskId: 'task-1' };
      setupMockSession({ sessionState: firstState });

      const invocation1 = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'first' },
        mockMessageBus,
      );
      await invocation1.execute({
        abortSignal: new AbortController().signal,
      });

      // Second invocation — the mock constructor should receive firstState
      const secondState = { contextId: 'ctx-2', taskId: 'task-2' };
      setupMockSession({ sessionState: secondState });

      const invocation2 = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'second' },
        mockMessageBus,
      );
      await invocation2.execute({
        abortSignal: new AbortController().signal,
      });

      // The second invocation should have received the first's state
      const secondCallArgs = vi.mocked(RemoteSubagentSession).mock.calls[1];
      expect(secondCallArgs[3]).toEqual(firstState);
    });

    it('should subscribe for progress updates', async () => {
      const completedProgress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: 'Test Agent',
        state: 'running',
        result: 'partial',
        recentActivity: [],
      };
      const { mockSession, emitEvent } = setupMockSession({
        progress: completedProgress,
      });

      const updateOutput = vi.fn();
      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );

      // Override getResult to emit a message event mid-execution
      mockSession.getResult.mockImplementation(async () => {
        emitEvent({
          type: 'message',
          id: 'e1',
          timestamp: new Date().toISOString(),
          streamId: 's1',
          role: 'agent',
          content: [{ type: 'text', text: 'hello' }],
        });
        return {
          llmContent: [{ text: 'done' }],
          returnDisplay: completedProgress,
        };
      });

      await invocation.execute({
        abortSignal: new AbortController().signal,
        updateOutput,
      });

      // subscribe should have been called (at least once for progress, possibly for parent)
      expect(mockSession.subscribe).toHaveBeenCalled();
      // updateOutput should have been called with the progress from getLatestProgress
      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
        }),
      );
    });

    it('should handle abort gracefully', async () => {
      const controller = new AbortController();

      const { mockSession } = setupMockSession();

      // When getResult resolves, the signal will already be aborted
      mockSession.getResult.mockImplementation(async () => {
        controller.abort();
        return {
          llmContent: [{ text: '' }],
          returnDisplay: '',
        };
      });

      const updateOutput = vi.fn();
      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );

      const result = await invocation.execute({
        abortSignal: controller.signal,
        updateOutput,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
      expect(result.llmContent).toEqual([
        { text: 'Operation cancelled by user' },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle execution errors gracefully', async () => {
      setupMockSession({ error: new Error('Network failure') });

      const updateOutput = vi.fn();
      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
        updateOutput,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
      expect((result.returnDisplay as SubagentProgress).result).toContain(
        'Network failure',
      );
      // updateOutput should be called with error progress
      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'error' }),
      );
    });

    it('should include partial output in error display', async () => {
      const partialProgress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: 'Test Agent',
        state: 'running',
        result: 'Partial work so far',
        recentActivity: [
          {
            id: 'a1',
            type: 'thought',
            content: 'Thinking...',
            status: 'running',
          },
        ],
      };

      setupMockSession({
        error: new Error('mid-stream error'),
        progress: partialProgress,
      });

      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      const display = result.returnDisplay as SubagentProgress;
      // Should contain both the partial output and the error
      expect(display.result).toContain('Partial work so far');
      expect(display.result).toContain('mid-stream error');
      // Should preserve partial activity
      expect(display.recentActivity).toHaveLength(1);
      expect(display.recentActivity[0].content).toBe('Thinking...');
    });

    it('should clean up listeners in finally', async () => {
      const { mockSession } = setupMockSession();

      const controller = new AbortController();
      const removeEventListenerSpy = vi.spyOn(
        controller.signal,
        'removeEventListener',
      );

      const onAgentEvent = vi.fn();
      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
        { onAgentEvent },
      );

      await invocation.execute({
        abortSignal: controller.signal,
      });

      // removeEventListener should have been called for the abort listener
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );

      // All unsubscribe functions returned by subscribe during execute should be called
      const postExecuteUnsubscribes = mockSession.subscribe.mock.results.map(
        (r) => r.value,
      );
      for (const unsub of postExecuteUnsubscribes) {
        expect(unsub).toHaveBeenCalled();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SessionState Management
  // ---------------------------------------------------------------------------

  describe('SessionState Management', () => {
    it('should use definition.name as session state key', async () => {
      const secondDefinition: RemoteAgentDefinition = {
        ...mockDefinition,
        name: 'other-agent',
        displayName: 'Other Agent',
      };

      // First agent
      setupMockSession({
        sessionState: { contextId: 'ctx-a' },
      });
      const inv1 = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await inv1.execute({ abortSignal: new AbortController().signal });

      // Second agent
      setupMockSession({
        sessionState: { contextId: 'ctx-b' },
      });
      const inv2 = new RemoteSessionInvocation(
        secondDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await inv2.execute({ abortSignal: new AbortController().signal });

      const stateMap = (
        RemoteSessionInvocation as unknown as {
          sessionState: Map<string, { contextId?: string; taskId?: string }>;
        }
      ).sessionState;

      // Each agent should have its own entry
      expect(stateMap.get('test-agent')).toEqual({ contextId: 'ctx-a' });
      expect(stateMap.get('other-agent')).toEqual({ contextId: 'ctx-b' });
    });

    it('should persist state even on error', async () => {
      const stateOnError = { contextId: 'ctx-err', taskId: 'task-err' };
      setupMockSession({
        error: new Error('boom'),
        sessionState: stateOnError,
      });

      const invocation = new RemoteSessionInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );

      await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      const stateMap = (
        RemoteSessionInvocation as unknown as {
          sessionState: Map<string, { contextId?: string; taskId?: string }>;
        }
      ).sessionState;

      expect(stateMap.get('test-agent')).toEqual(stateOnError);
    });
  });
});
