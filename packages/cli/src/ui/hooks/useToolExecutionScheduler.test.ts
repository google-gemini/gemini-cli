/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useToolExecutionScheduler } from './useToolExecutionScheduler.js';
import {
  MessageBusType,
  ToolConfirmationOutcome,
  Scheduler,
  type Config,
  type MessageBus,
  type CompletedToolCall,
  type ToolCallConfirmationDetails,
  type ToolCallsUpdateMessage,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
  ROOT_SCHEDULER_ID,
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

describe('useToolExecutionScheduler', () => {
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
      useToolExecutionScheduler(
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
      useToolExecutionScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const mockToolCall = {
      status: 'executing' as const,
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
    };

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
      status: 'executing', // Core status
      liveOutput: 'Loading...',
      responseSubmittedToGemini: false,
    });
  });

  it('injects onConfirm callback for awaiting_approval tools (Adapter Pattern)', async () => {
    const { result } = renderHook(() =>
      useToolExecutionScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const mockToolCall = {
      status: 'awaiting_approval' as const,
      request: {
        callId: 'call-1',
        name: 'test_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation({
        getDescription: () => 'Confirming test tool',
      }),
      confirmationDetails: { type: 'info', title: 'Confirm', prompt: 'Sure?' },
      correlationId: 'corr-123',
    };

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    const [toolCalls] = result.current;
    const call = toolCalls[0];
    if (call.status !== 'awaiting_approval') {
      throw new Error('Expected status to be awaiting_approval');
    }
    const confirmationDetails =
      call.confirmationDetails as ToolCallConfirmationDetails;

    expect(confirmationDetails).toBeDefined();
    expect(typeof confirmationDetails.onConfirm).toBe('function');

    // Test that onConfirm publishes to MessageBus
    const publishSpy = vi.spyOn(mockMessageBus, 'publish');
    await confirmationDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);

    expect(publishSpy).toHaveBeenCalledWith({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: 'corr-123',
      confirmed: true,
      requiresUserConfirmation: false,
      outcome: ToolConfirmationOutcome.ProceedOnce,
      payload: undefined,
    });
  });

  it('injects onConfirm with payload (Inline Edit support)', async () => {
    const { result } = renderHook(() =>
      useToolExecutionScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const mockToolCall = {
      status: 'awaiting_approval' as const,
      request: {
        callId: 'call-1',
        name: 'test_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'p1',
      },
      tool: createMockTool(),
      invocation: createMockInvocation(),
      confirmationDetails: { type: 'edit', title: 'Edit', filePath: 'test.ts' },
      correlationId: 'corr-edit',
    };

    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    const [toolCalls] = result.current;
    const call = toolCalls[0];
    if (call.status !== 'awaiting_approval') {
      throw new Error('Expected awaiting_approval');
    }
    const confirmationDetails =
      call.confirmationDetails as ToolCallConfirmationDetails;

    const publishSpy = vi.spyOn(mockMessageBus, 'publish');
    const mockPayload = { newContent: 'updated code' };
    await confirmationDetails.onConfirm(
      ToolConfirmationOutcome.ProceedOnce,
      mockPayload,
    );

    expect(publishSpy).toHaveBeenCalledWith({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: 'corr-edit',
      confirmed: true,
      requiresUserConfirmation: false,
      outcome: ToolConfirmationOutcome.ProceedOnce,
      payload: mockPayload,
    });
  });

  it('preserves responseSubmittedToGemini flag across updates', () => {
    const { result } = renderHook(() =>
      useToolExecutionScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const mockToolCall = {
      status: 'success' as const,
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
      useToolExecutionScheduler(
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
            status: 'executing' as const,
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
      useToolExecutionScheduler(
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
      status: 'success' as const,
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
      useToolExecutionScheduler(onComplete, mockConfig, () => undefined),
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
      useToolExecutionScheduler(
        vi.fn().mockResolvedValue(undefined),
        mockConfig,
        () => undefined,
      ),
    );

    const callRoot = {
      status: 'success' as const,
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
      schedulerId: 'subagent-1',
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

    let [toolCalls] = result.current;
    expect(toolCalls).toHaveLength(2);
    expect(
      toolCalls.find((t) => t.request.callId === 'call-root')?.schedulerId,
    ).toBe(ROOT_SCHEDULER_ID);
    expect(
      toolCalls.find((t) => t.request.callId === 'call-sub')?.schedulerId,
    ).toBe('subagent-1');

    // 2. Call setToolCallsForDisplay (e.g., simulate a manual update or clear)
    act(() => {
      const [, , , setToolCalls] = result.current;
      setToolCalls((prev) =>
        prev.map((t) => ({ ...t, responseSubmittedToGemini: true })),
      );
    });

    // 3. Verify that tools are still present and maintain their scheduler IDs
    // The internal map should have been re-grouped.
    [toolCalls] = result.current;
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls.every((t) => t.responseSubmittedToGemini)).toBe(true);

    const updatedRoot = toolCalls.find((t) => t.request.callId === 'call-root');
    const updatedSub = toolCalls.find((t) => t.request.callId === 'call-sub');

    expect(updatedRoot?.schedulerId).toBe(ROOT_SCHEDULER_ID);
    expect(updatedSub?.schedulerId).toBe('subagent-1');

    // 4. Verify that a subsequent update to ONE scheduler doesn't wipe the other
    act(() => {
      void mockMessageBus.publish({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [{ ...callRoot, status: 'executing' }],
        schedulerId: ROOT_SCHEDULER_ID,
      } as ToolCallsUpdateMessage);
    });

    [toolCalls] = result.current;
    expect(toolCalls).toHaveLength(2);
    expect(
      toolCalls.find((t) => t.request.callId === 'call-root')?.status,
    ).toBe('executing');
    expect(
      toolCalls.find((t) => t.request.callId === 'call-sub')?.schedulerId,
    ).toBe('subagent-1');
  });
});
