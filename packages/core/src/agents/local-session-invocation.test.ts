/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentTerminateMode,
  SubagentActivityErrorType,
  SUBAGENT_REJECTED_ERROR_PREFIX,
  SUBAGENT_CANCELLED_ERROR_MESSAGE,
  type SubagentProgress,
  type LocalAgentDefinition,
  type AgentInputs,
  type SubagentActivityEvent,
} from './types.js';
import { LocalSessionInvocation } from './local-session-invocation.js';
import { LocalSubagentSession } from './local-subagent-protocol.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

vi.mock('./local-subagent-protocol.js');

const MockLocalSubagentSession = vi.mocked(LocalSubagentSession);

let capturedActivityCallback:
  | ((activity: SubagentActivityEvent) => void)
  | undefined;

const testDefinition: LocalAgentDefinition = {
  kind: 'local',
  name: 'MockAgent',
  description: 'A mock agent for testing.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: { task: { type: 'string' } },
    },
  },
  modelConfig: { model: 'test-model', generateContentConfig: {} },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'test' },
};

function setupMockSession(config: {
  output?: { result: string; terminate_reason: AgentTerminateMode };
  error?: Error;
}) {
  const mockSession = {
    send: vi.fn().mockResolvedValue({ streamId: 'stream-1' }),
    getResult: config.error
      ? vi.fn().mockRejectedValue(config.error)
      : vi.fn().mockResolvedValue(
          config.output ?? {
            result: 'done',
            terminate_reason: AgentTerminateMode.GOAL,
          },
        ),
    abort: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  };
  MockLocalSubagentSession.mockImplementation(
    (
      _def: LocalAgentDefinition,
      _ctx: AgentLoopContext,
      _bus: MessageBus,
      rawCallback?: (activity: SubagentActivityEvent) => void,
    ) => {
      capturedActivityCallback = rawCallback;
      return mockSession as unknown as LocalSubagentSession;
    },
  );
  return mockSession;
}

describe('LocalSessionInvocation', () => {
  let mockContext: AgentLoopContext;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedActivityCallback = undefined;
    mockContext = makeFakeConfig() as unknown as AgentLoopContext;
    mockMessageBus = createMockMessageBus();
  });

  it('should pass the messageBus to the parent constructor', () => {
    setupMockSession({});
    const params = { task: 'Analyze data' };
    const invocation = new LocalSessionInvocation(
      testDefinition,
      mockContext,
      params,
      mockMessageBus,
    );
    expect(
      (invocation as unknown as { messageBus: MessageBus }).messageBus,
    ).toBe(mockMessageBus);
  });

  describe('getDescription', () => {
    it('should format the description with inputs and truncate long values and overall length', () => {
      setupMockSession({});
      const params = { task: 'Analyze data', priority: 5 };
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );
      const description = invocation.getDescription();
      expect(description).toBe(
        "Running subagent 'MockAgent' with inputs: { task: Analyze data, priority: 5 }",
      );
    });

    it('should truncate long input values', () => {
      setupMockSession({});
      const longTask = 'A'.repeat(100);
      const params = { task: longTask };
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );
      const description = invocation.getDescription();
      expect(description).toBe(
        `Running subagent 'MockAgent' with inputs: { task: ${'A'.repeat(50)} }`,
      );
    });

    it('should truncate the overall description if it exceeds the limit', () => {
      setupMockSession({});
      const longNameDef: LocalAgentDefinition = {
        ...testDefinition,
        name: 'VeryLongAgentNameThatTakesUpSpace',
      };
      const params: AgentInputs = {};
      for (let i = 0; i < 20; i++) {
        params[`input${i}`] = `value${i}`;
      }
      const invocation = new LocalSessionInvocation(
        longNameDef,
        mockContext,
        params,
        mockMessageBus,
      );
      const description = invocation.getDescription();
      expect(description.length).toBe(200);
    });
  });

  describe('execute', () => {
    it('should create session and run successfully', async () => {
      const mockOutput = {
        result: 'Analysis complete.',
        terminate_reason: AgentTerminateMode.GOAL,
      };
      const mockSession = setupMockSession({ output: mockOutput });
      const params = { query: 'Execute task' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const result = await invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      expect(MockLocalSubagentSession).toHaveBeenCalledWith(
        testDefinition,
        mockContext,
        mockMessageBus,
        expect.any(Function),
      );
      expect(mockSession.send).toHaveBeenCalledWith({
        message: { content: [{ type: 'text', text: 'Execute task' }] },
      });
      expect(result.llmContent).toEqual([
        {
          text: expect.stringContaining(
            "Subagent 'MockAgent' finished.\nTermination Reason: GOAL\nResult:\nAnalysis complete.",
          ),
        },
      ]);
      const display = result.returnDisplay as SubagentProgress;
      expect(display.isSubagentProgress).toBe(true);
      expect(display.state).toBe('completed');
      expect(display.result).toBe('Analysis complete.');
      expect(display.terminateReason).toBe(AgentTerminateMode.GOAL);
    });

    it('should stream THOUGHT_CHUNK activity', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'think' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      // Wait for send to be called so the activity callback is wired
      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      // Emit a thought chunk via captured callback
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'THOUGHT_CHUNK',
        data: { text: 'Analyzing...' },
      });

      await executePromise;

      // Find an updateOutput call containing the thought
      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      const hasThought = progressCalls.some(
        (p) =>
          p.recentActivity &&
          p.recentActivity.some(
            (a) => a.type === 'thought' && a.content === 'Analyzing...',
          ),
      );
      expect(hasThought).toBe(true);
    });

    it('should stream TOOL_CALL_START and TOOL_CALL_END', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'run tool' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'ls', args: {} },
      });
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_END',
        data: { name: 'ls', data: {} },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );

      // After TOOL_CALL_START, the immediate updateOutput call should show running
      const runningCalls = progressCalls.filter((p) => p.state === 'running');
      // The first running call with a tool_call should show 'running'
      const firstToolCall = runningCalls.find((p) =>
        p.recentActivity?.some(
          (a) => a.type === 'tool_call' && a.content === 'ls',
        ),
      );
      expect(firstToolCall).toBeDefined();

      // After TOOL_CALL_END, the tool should be completed
      const hasCompleted = progressCalls.some((p) =>
        p.recentActivity?.some(
          (a) =>
            a.type === 'tool_call' &&
            a.content === 'ls' &&
            a.status === 'completed',
        ),
      );
      expect(hasCompleted).toBe(true);
    });

    it('should handle ERROR activity', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'fail' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'ERROR',
        data: { error: 'Something broke' },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      const hasError = progressCalls.some((p) =>
        p.recentActivity?.some(
          (a) =>
            a.type === 'thought' &&
            a.content === 'Error: Something broke' &&
            a.status === 'error',
        ),
      );
      expect(hasError).toBe(true);
    });

    it('should handle cancelled errors', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'cancel' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'ERROR',
        data: {
          error: SUBAGENT_CANCELLED_ERROR_MESSAGE,
          errorType: SubagentActivityErrorType.CANCELLED,
        },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      const hasCancelled = progressCalls.some((p) =>
        p.recentActivity?.some(
          (a) => a.type === 'thought' && a.status === 'cancelled',
        ),
      );
      expect(hasCancelled).toBe(true);
    });

    it('should handle rejected errors', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'reject' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'dangerous_tool', args: {} },
      });
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'ERROR',
        data: {
          name: 'dangerous_tool',
          error: `${SUBAGENT_REJECTED_ERROR_PREFIX} Rethink approach.`,
          errorType: SubagentActivityErrorType.REJECTED,
        },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      // Tool call should be marked cancelled
      const hasToolCancelled = progressCalls.some((p) =>
        p.recentActivity?.some(
          (a) =>
            a.type === 'tool_call' &&
            a.content === 'dangerous_tool' &&
            a.status === 'cancelled',
        ),
      );
      expect(hasToolCancelled).toBe(true);
    });

    it('should trim recentActivity to MAX_RECENT_ACTIVITY', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'trim' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      // Emit 4+ activities to exceed MAX_RECENT_ACTIVITY (3)
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool1', args: {} },
      });
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool2', args: {} },
      });
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool3', args: {} },
      });
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'tool4', args: {} },
      });

      await executePromise;

      // After the 4th activity, the last updateOutput call before completion
      // should have only 3 items in recentActivity
      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      // Find the call right after the 4th activity (before completion)
      const afterFourthActivity = progressCalls.filter(
        (p) => p.state === 'running' && p.recentActivity.length > 0,
      );
      const lastRunning = afterFourthActivity[afterFourthActivity.length - 1];
      expect(lastRunning.recentActivity.length).toBeLessThanOrEqual(3);
      // Should contain tool4 (the latest)
      expect(
        lastRunning.recentActivity.some((a) => a.content === 'tool4'),
      ).toBe(true);
      // Should NOT contain tool1 (trimmed away)
      expect(
        lastRunning.recentActivity.some((a) => a.content === 'tool1'),
      ).toBe(false);
    });

    it('should handle executor errors', async () => {
      const error = new Error('Model failed during execution.');
      setupMockSession({ error });
      const params = { query: 'fail hard' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const result = await invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      expect(result.llmContent).toBe(
        `Subagent 'MockAgent' failed. Error: ${error.message}`,
      );
      const display = result.returnDisplay as SubagentProgress;
      expect(display.isSubagentProgress).toBe(true);
      expect(display.state).toBe('error');
      expect(display.recentActivity).toContainEqual(
        expect.objectContaining({
          type: 'thought',
          content: `Error: ${error.message}`,
          status: 'error',
        }),
      );
    });

    it('should handle abort', async () => {
      const mockOutput = {
        result: '',
        terminate_reason: AgentTerminateMode.ABORTED,
      };
      setupMockSession({ output: mockOutput });
      const params = { query: 'abort me' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      await expect(
        invocation.execute({ abortSignal: signal, updateOutput }),
      ).rejects.toThrow('Operation cancelled by user');

      // Verify cancelled state was published
      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      const hasCancelledState = progressCalls.some(
        (p) => p.state === 'cancelled',
      );
      expect(hasCancelledState).toBe(true);
    });

    it('should wire abort signal to session.abort', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'abort wire' };
      const controller = new AbortController();
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: controller.signal,
        updateOutput,
      });

      // Trigger abort
      controller.abort();

      // The execute should complete (getResult returned GOAL by default)
      await executePromise.catch(() => {
        /* abort may throw */
      });

      expect(mockSession.abort).toHaveBeenCalled();
    });

    it('should send non-query params as config update before query', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'Do something', extra_config: 'value123' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      await invocation.execute({ abortSignal: signal, updateOutput });

      // First send: config update with non-query params
      expect(mockSession.send).toHaveBeenCalledWith({
        update: { config: { extra_config: 'value123' } },
      });
      // Second send: message with query
      expect(mockSession.send).toHaveBeenCalledWith({
        message: { content: [{ type: 'text', text: 'Do something' }] },
      });
      // Config update should come before message
      const sendCalls = mockSession.send.mock.calls;
      const configIdx = sendCalls.findIndex((c) => c[0]?.update?.config);
      const messageIdx = sendCalls.findIndex((c) => c[0]?.message);
      expect(configIdx).toBeLessThan(messageIdx);
    });

    it('should publish SUBAGENT_ACTIVITY on messageBus', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'publish test' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'THOUGHT_CHUNK',
        data: { text: 'Thinking...' },
      });

      await executePromise;

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.SUBAGENT_ACTIVITY,
          subagentName: 'MockAgent',
          activity: expect.objectContaining({
            type: 'thought',
            content: 'Thinking...',
          }),
        }),
      );
    });

    it('should clean up abort listener in finally', async () => {
      setupMockSession({});
      const params = { query: 'cleanup' };
      const controller = new AbortController();
      const removeEventListenerSpy = vi.spyOn(
        controller.signal,
        'removeEventListener',
      );
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      await invocation.execute({
        abortSignal: controller.signal,
        updateOutput,
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
    });

    it('should unsubscribe parent observer in finally', async () => {
      const unsubscribeFn = vi.fn();
      const mockSession = setupMockSession({});
      mockSession.subscribe.mockReturnValue(unsubscribeFn);

      const params = { query: 'unsub test' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const onAgentEvent = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
        { onAgentEvent },
      );

      await invocation.execute({ abortSignal: signal, updateOutput });

      expect(mockSession.subscribe).toHaveBeenCalledWith(onAgentEvent);
      expect(unsubscribeFn).toHaveBeenCalled();
    });

    it('should handle TOOL_CALL_END with error data', async () => {
      const mockSession = setupMockSession({});
      const params = { query: 'tool error' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'failing_tool', args: {} },
      });
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_END',
        data: { name: 'failing_tool', data: { isError: true } },
      });

      await executePromise;

      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      const hasToolError = progressCalls.some((p) =>
        p.recentActivity?.some(
          (a) =>
            a.type === 'tool_call' &&
            a.content === 'failing_tool' &&
            a.status === 'error',
        ),
      );
      expect(hasToolError).toBe(true);
    });

    it('should mark running items as cancelled on abort', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      const mockSession = setupMockSession({ error: abortError });
      const params = { query: 'mark cancelled' };
      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      const invocation = new LocalSessionInvocation(
        testDefinition,
        mockContext,
        params,
        mockMessageBus,
      );

      const executePromise = invocation.execute({
        abortSignal: signal,
        updateOutput,
      });

      await vi.waitFor(() => expect(mockSession.send).toHaveBeenCalled());

      // Emit a running tool call before the abort
      capturedActivityCallback!({
        isSubagentActivityEvent: true,
        agentName: 'MockAgent',
        type: 'TOOL_CALL_START',
        data: { name: 'running_tool', args: {} },
      });

      await expect(executePromise).rejects.toThrow('Aborted');

      const progressCalls = updateOutput.mock.calls.map(
        (c) => c[0] as SubagentProgress,
      );
      // The final progress should show the tool as cancelled
      const lastProgress = progressCalls[progressCalls.length - 1];
      expect(lastProgress.state).toBe('cancelled');
      expect(lastProgress.recentActivity).toContainEqual(
        expect.objectContaining({
          type: 'tool_call',
          content: 'running_tool',
          status: 'cancelled',
        }),
      );
    });
  });
});
