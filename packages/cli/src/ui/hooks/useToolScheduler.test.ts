/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useToolScheduler } from './useToolScheduler.js';
import {
  MessageBusType,
  Scheduler,
  type Config,
  type MessageBus,
  type ExecutingToolCall,
  type CompletedToolCall,
  type ToolCallsUpdateMessage,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
  ROOT_SCHEDULER_ID,
  CoreToolCallStatus,
  type WaitingToolCall,
} from '@google/gemini-cli-core';
import { createMockMessageBus } from '@google/gemini-cli-core/src/test-utils/mock-message-bus.js';

// Mock Core Scheduler
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Scheduler: vi.fn().mockImplementation(() => ({
      schedule: vi.fn().mockResolvedValue([]),
      cancelAll: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

const createMockTool = (
  overrides: Partial<AnyDeclarativeTool> = {},
): AnyDeclarativeTool =>
  ({
    name: 'test_tool',
    displayName: 'Test Tool',
    description: 'A test tool',
    kind: 'function',
    parameterSchema: {},
    isOutputMarkdown: false,
    build: vi.fn(),
    ...overrides,
  }) as AnyDeclarativeTool;

const createMockInvocation = (
  overrides: Partial<AnyToolInvocation> = {},
): AnyToolInvocation =>
  ({
    getDescription: () => 'Executing test tool',
    shouldConfirmExecute: vi.fn(),
    execute: vi.fn(),
    params: {},
    toolLocations: [],
    ...overrides,
  }) as AnyToolInvocation;

describe('useToolScheduler', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageBus = createMockMessageBus() as unknown as MessageBus;
    mockConfig = {
      getMessageBus: () => mockMessageBus,
    } as unknown as Config;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with empty tool calls', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );
    const [toolCalls] = result.current;
    expect(toolCalls).toEqual([]);
  });

  it('updates tool calls when MessageBus emits TOOL_CALLS_UPDATE', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const mockToolCall = {
      status: CoreToolCallStatus.Executing as const,
      request: {
        callId: 'call-1',
        name: 'test_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      liveOutput: 'Loading...',
    } as ExecutingToolCall;

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    const [toolCalls] = result.current;
    expect(toolCalls).toHaveLength(1);
    // Expect Core Object structure, not Display Object
    expect(toolCalls[0]).toMatchObject({
      request: { callId: 'call-1', name: 'test_tool' },
      status: CoreToolCallStatus.Executing,
      liveOutput: 'Loading...',
      responseSubmittedToGemini: false,
    });
  });

  it('preserves responseSubmittedToGemini flag across updates', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const mockToolCall = {
      status: CoreToolCallStatus.Success as const,
      request: {
        callId: 'call-1',
        name: 'test',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      response: {
        callId: 'call-1',
        resultDisplay: 'OK',
        responseParts: [],
        error: undefined,
        errorType: undefined,
      },
    };

    // 1. Initial success
    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    // 2. Mark as submitted
    act(() => {
      const [, , markAsSubmitted] = result.current;
      markAsSubmitted(['call-1']);
    });

    expect(result.current[0][0].responseSubmittedToGemini).toBe(true);

    // 3. Receive another update (should preserve the true flag)
    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    expect(result.current[0][0].responseSubmittedToGemini).toBe(true);
  });

  it('updates lastToolOutputTime when tools are executing', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const startTime = Date.now();
    vi.advanceTimersByTime(1000);

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [
          {
            status: CoreToolCallStatus.Executing as const,
            request: {
              callId: 'call-1',
              name: 'test',
              args: {},
              isClientInitiated: false,
              prompt_id: 'p1',
            },
            tool: createMockTool(),
            invocation: createMockInvocation(),
          },
        ],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    const [, , , , , lastOutputTime] = result.current;
    expect(lastOutputTime).toBeGreaterThan(startTime);
    vi.useRealTimers();
  });

  it('delegates cancelAll to the Core Scheduler', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const [, , , , cancelAll] = result.current;
    const signal = new AbortController().signal;

    // We need to find the mock instance of Scheduler
    // Since we used vi.mock at top level, we can get it from vi.mocked(Scheduler)
    const schedulerInstance = vi.mocked(Scheduler).mock.results[0].value;

    cancelAll(signal);

    expect(schedulerInstance.cancelAll).toHaveBeenCalled();
  });

  it('resolves the schedule promise when scheduler resolves', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);

    const completedToolCall = {
      status: CoreToolCallStatus.Success as const,
      request: {
        callId: 'call-1',
        name: 'test',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      response: {
        callId: 'call-1',
        responseParts: [],
        resultDisplay: 'Success',
        error: undefined,
        errorType: undefined,
      },
    };

    // Mock the specific return value for this test
    const { Scheduler } = await import('@google/gemini-cli-core');
    vi.mocked(Scheduler).mockImplementation(
      () =>
        ({
          schedule: vi.fn().mockResolvedValue([completedToolCall]),
          cancelAll: vi.fn(),
        }) as unknown as Scheduler,
    );

    const { result } = renderHook(() =>
      useToolScheduler(onComplete, mockConfig, () => undefined),
    );

    const [, schedule] = result.current;
    const signal = new AbortController().signal;

    let completedResult: CompletedToolCall[] = [];
    await act(async () => {
      completedResult = await schedule(
        {
          callId: 'call-1',
          name: 'test',
          args: {},
          isClientInitiated: false,
          prompt_id: 'p1',
        },
        signal,
      );
    });

    expect(completedResult).toEqual([completedToolCall]);
    expect(onComplete).toHaveBeenCalledWith([completedToolCall]);
  });

  it('setToolCallsForDisplay re-groups tools by schedulerId (Multi-Scheduler support)', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const callRoot = {
      status: CoreToolCallStatus.Success as const,
      request: {
        callId: 'call-root',
        name: 'test',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      response: {
        callId: 'call-root',
        responseParts: [],
        resultDisplay: 'OK',
        error: undefined,
        errorType: undefined,
      },
      schedulerId: ROOT_SCHEDULER_ID,
    };

    const callSub = {
      ...callRoot,
      request: { ...callRoot.request, callId: 'call-sub' },
      status: CoreToolCallStatus.AwaitingApproval as const, // Must be awaiting approval to be tracked
      schedulerId: 'subagent-1',
      confirmationDetails: { type: 'info', title: 'Confirm', prompt: 'Yes?' },
    };

    // 1. Populate state with multiple schedulers
    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [callRoot],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);

      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [callSub],
        schedulerId: 'subagent-1',
      } as ToolCallsUpdateMessage);
    });

    const [toolCalls] = result.current;
    expect(toolCalls).toHaveLength(2);
    expect(
      toolCalls.find((t) => t.request.callId === 'call-root'),
    ).toBeDefined();
    expect(
      toolCalls.find((t) => t.request.callId === 'call-sub'),
    ).toBeDefined();

    // 2. Call setToolCallsForDisplay (e.g., simulate a manual update or clear)
    act(() => {
      const [, , , setToolCalls] = result.current;
      setToolCalls((prev) =>
        prev.map((t) => ({ ...t, responseSubmittedToGemini: true })),
      );
    });

    // 3. Verify that tools are still present and maintain their scheduler IDs
    const [toolCalls2] = result.current;
    expect(toolCalls2).toHaveLength(2);
    expect(toolCalls2.every((t) => t.responseSubmittedToGemini)).toBe(true);
  });

  it('ignores TOOL_CALLS_UPDATE from non-root schedulers when no tools await approval', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const subagentCall = {
      status: CoreToolCallStatus.Executing as const,
      request: {
        callId: 'call-sub',
        name: 'test',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      schedulerId: 'subagent-1',
    };

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [subagentCall],
        schedulerId: 'subagent-1',
      } as ToolCallsUpdateMessage);
    });

    expect(result.current[0]).toHaveLength(0);
  });

  it('allows TOOL_CALLS_UPDATE from non-root schedulers when tools are awaiting approval', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const subagentCall = {
      status: CoreToolCallStatus.AwaitingApproval as const,
      request: {
        callId: 'call-sub',
        name: 'test',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      schedulerId: 'subagent-1',
      confirmationDetails: { type: 'info', title: 'Confirm', prompt: 'Yes?' },
    } as WaitingToolCall;

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [subagentCall],
        schedulerId: 'subagent-1',
      } as ToolCallsUpdateMessage);
    });

    const [toolCalls] = result.current;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].request.callId).toBe('call-sub');
    expect(toolCalls[0].status).toBe(CoreToolCallStatus.AwaitingApproval);
  });

  it('preserves subagent tools in the UI after they have been approved', () => {
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const subagentCall = {
      status: CoreToolCallStatus.AwaitingApproval as const,
      request: {
        callId: 'call-sub',
        name: 'test',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      schedulerId: 'subagent-1',
      confirmationDetails: { type: 'info', title: 'Confirm', prompt: 'Yes?' },
    } as WaitingToolCall;

    // 1. Initial approval request
    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [subagentCall],
        schedulerId: 'subagent-1',
      } as ToolCallsUpdateMessage);
    });

    expect(result.current[0]).toHaveLength(1);

    // 2. Approved and executing
    const approvedCall = {
      ...subagentCall,
      status: CoreToolCallStatus.Executing as const,
    } as unknown as ExecutingToolCall;

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [approvedCall],
        schedulerId: 'subagent-1',
      } as ToolCallsUpdateMessage);
    });

    expect(result.current[0]).toHaveLength(1);
    expect(result.current[0][0].status).toBe(CoreToolCallStatus.Executing);

    // 3. New turn with a background tool (should NOT be shown)
    const backgroundTool = {
      status: CoreToolCallStatus.Executing as const,
      request: {
        callId: 'call-background',
        name: 'read_file',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      schedulerId: 'subagent-1',
    } as ExecutingToolCall;

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [backgroundTool],
        schedulerId: 'subagent-1',
      } as ToolCallsUpdateMessage);
    });

    // The subagent list should now be empty because the previously approved tool
    // is gone from the current list, and the new tool doesn't need approval.
    expect(result.current[0]).toHaveLength(0);
  });

  it('adapts success/error status to executing when a tail call is present', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useToolScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const startTime = Date.now();
    vi.advanceTimersByTime(1000);

    const mockToolCall = {
      status: CoreToolCallStatus.Success as const,
      request: {
        callId: 'call-1',
        name: 'test_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      response: {
        callId: 'call-1',
        resultDisplay: 'OK',
        responseParts: [],
        error: undefined,
        errorType: undefined,
      },
      tailToolCallRequest: {
        name: 'tail_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: '123',
      },
    };

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    const [toolCalls, , , , , lastOutputTime] = result.current;

    // Check if status has been adapted to 'executing'
    expect(toolCalls[0].status).toBe(CoreToolCallStatus.Executing);

    // Check if lastOutputTime was updated due to the transitional state
    expect(lastOutputTime).toBeGreaterThan(startTime);

    vi.useRealTimers();
  });
});
