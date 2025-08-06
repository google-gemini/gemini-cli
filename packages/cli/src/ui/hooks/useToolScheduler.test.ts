/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useReactToolScheduler,
  mapToDisplay,
} from './useReactToolScheduler.js';
import { PartUnion, FunctionResponse } from '@google/genai';
import {
  Config,
  ToolCallRequestInfo,
  ToolRegistry,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolCallResponseInfo,
  ToolCall, // Import from core
  Status as ToolCallStatusType,
  ApprovalMode,
  Icon,
  BaseTool,
  AnyDeclarativeTool,
  AnyToolInvocation,
} from '@google/gemini-cli-core';
import {
  HistoryItemWithoutId,
  ToolCallStatus,
  HistoryItemToolGroup,
} from '../types.js';

// Mocks
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    ToolRegistry: vi.fn(),
    Config: vi.fn(),
  };
});

const mockToolRegistry = {
  getTool: vi.fn(),
};

const mockConfig = {
  getToolRegistry: vi.fn(() => mockToolRegistry as unknown as ToolRegistry),
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
};

class MockTool extends BaseTool<object, ToolResult> {
  constructor(
    name: string,
    displayName: string,
    canUpdateOutput = false,
    shouldConfirm = false,
    isOutputMarkdown = false,
  ) {
    super(
      name,
      displayName,
      'A mock tool for testing',
      Icon.Hammer,
      {},
      isOutputMarkdown,
      canUpdateOutput,
    );
    if (shouldConfirm) {
      this.shouldConfirmExecute = vi.fn(
        async (): Promise<ToolCallConfirmationDetails | false> => ({
          type: 'edit',
          title: 'Mock Tool Requires Confirmation',
          onConfirm: mockOnUserConfirmForToolConfirmation,
          fileName: 'mockToolRequiresConfirmation.ts',
          fileDiff: 'Mock tool requires confirmation',
          originalContent: 'Original content',
          newContent: 'New content',
        }),
      );
    }
  }

  execute = vi.fn();
  shouldConfirmExecute = vi.fn();
}

const mockTool = new MockTool('mockTool', 'Mock Tool');
const mockToolWithLiveOutput = new MockTool(
  'mockToolWithLiveOutput',
  'Mock Tool With Live Output',
  true,
);
let mockOnUserConfirmForToolConfirmation: Mock;
const mockToolRequiresConfirmation = new MockTool(
  'mockToolRequiresConfirmation',
  'Mock Tool Requires Confirmation',
  false,
  true,
);

describe('useReactToolScheduler in YOLO Mode', () => {
  let onComplete: Mock;
  let setPendingHistoryItem: Mock;

  beforeEach(() => {
    onComplete = vi.fn();
    setPendingHistoryItem = vi.fn();
    mockToolRegistry.getTool.mockClear();
    (mockToolRequiresConfirmation.execute as Mock).mockClear();
    (mockToolRequiresConfirmation.shouldConfirmExecute as Mock).mockClear();

    // IMPORTANT: Enable YOLO mode for this test suite
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.YOLO);

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // IMPORTANT: Disable YOLO mode after this test suite
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);
  });

  const renderSchedulerInYoloMode = () =>
    renderHook(() =>
      useReactToolScheduler(
        onComplete,
        mockConfig as unknown as Config,
        setPendingHistoryItem,
      ),
    );

  it('should skip confirmation and execute tool directly when yoloMode is true', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const expectedOutput = 'YOLO Confirmed output';
    (mockToolRequiresConfirmation.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: 'YOLO Formatted tool output',
      summary: 'YOLO summary',
    } as ToolResult);

    const { result } = renderSchedulerInYoloMode();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'yoloCall',
      name: 'mockToolRequiresConfirmation',
      args: { data: 'any data' },
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });

    await act(async () => {
      await vi.runAllTimersAsync(); // Process validation
    });
    await act(async () => {
      await vi.runAllTimersAsync(); // Process scheduling
    });
    await act(async () => {
      await vi.runAllTimersAsync(); // Process execution
    });

    // Check that shouldConfirmExecute was NOT called
    expect(
      mockToolRequiresConfirmation.shouldConfirmExecute,
    ).not.toHaveBeenCalled();

    // Check that execute WAS called
    expect(mockToolRequiresConfirmation.execute).toHaveBeenCalledWith(
      request.args,
      expect.any(AbortSignal),
      undefined,
    );

    // Check that onComplete was called with success
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request,
        response: expect.objectContaining({
          resultDisplay: 'YOLO Formatted tool output',
          responseParts: {
            functionResponse: {
              id: 'yoloCall',
              name: 'mockToolRequiresConfirmation',
              response: { output: expectedOutput },
            },
          },
        }),
      }),
    ]);

    // Ensure no confirmation UI was triggered (setPendingHistoryItem should not have been called with confirmation details)
    const setPendingHistoryItemCalls = setPendingHistoryItem.mock.calls;
    const confirmationCall = setPendingHistoryItemCalls.find((call) => {
      const item = typeof call[0] === 'function' ? call[0]({}) : call[0];
      return item?.tools?.[0]?.confirmationDetails;
    });
    expect(confirmationCall).toBeUndefined();
  });
});

describe('useReactToolScheduler', () => {
  // TODO(ntaylormullen): The following tests are skipped due to difficulties in
  // reliably testing the asynchronous state updates and interactions with timers.
  // These tests involve complex sequences of events, including confirmations,
  // live output updates, and cancellations, which are challenging to assert
  // correctly with the current testing setup. Further investigation is needed
  // to find a robust way to test these scenarios.
  let onComplete: Mock;
  let setPendingHistoryItem: Mock;
  let capturedOnConfirmForTest:
    | ((outcome: ToolConfirmationOutcome) => void | Promise<void>)
    | undefined;

  beforeEach(() => {
    onComplete = vi.fn();
    capturedOnConfirmForTest = undefined;
    setPendingHistoryItem = vi.fn((updaterOrValue) => {
      let pendingItem: HistoryItemWithoutId | null = null;
      if (typeof updaterOrValue === 'function') {
        // Loosen the type for prevState to allow for more flexible updates in tests
        const prevState: Partial<HistoryItemToolGroup> = {
          type: 'tool_group', // Still default to tool_group for most cases
          tools: [],
        };

        pendingItem = updaterOrValue(prevState as any); // Allow any for more flexibility
      } else {
        pendingItem = updaterOrValue;
      }
      // Capture onConfirm if it exists, regardless of the exact type of pendingItem
      // This is a common pattern in these tests.
      if (
        (pendingItem as HistoryItemToolGroup)?.tools?.[0]?.confirmationDetails
          ?.onConfirm
      ) {
        capturedOnConfirmForTest = (pendingItem as HistoryItemToolGroup)
          .tools[0].confirmationDetails?.onConfirm;
      }
    });

    mockToolRegistry.getTool.mockClear();
    (mockTool.execute as Mock).mockClear();
    (mockTool.shouldConfirmExecute as Mock).mockClear();
    (mockToolWithLiveOutput.execute as Mock).mockClear();
    (mockToolWithLiveOutput.shouldConfirmExecute as Mock).mockClear();
    (mockToolRequiresConfirmation.execute as Mock).mockClear();
    (mockToolRequiresConfirmation.shouldConfirmExecute as Mock).mockClear();

    mockOnUserConfirmForToolConfirmation = vi.fn();
    (
      mockToolRequiresConfirmation.shouldConfirmExecute as Mock
    ).mockImplementation(
      async (): Promise<ToolCallConfirmationDetails | null> => ({
        onConfirm: mockOnUserConfirmForToolConfirmation,
        fileName: 'mockToolRequiresConfirmation.ts',
        fileDiff: 'Mock tool requires confirmation',
        type: 'edit',
        title: 'Mock Tool Requires Confirmation',
      }),
    );

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const renderScheduler = () =>
    renderHook(() =>
      useReactToolScheduler(
        onComplete,
        mockConfig as unknown as Config,
        setPendingHistoryItem,
      ),
    );

  it('initial state should be empty', () => {
    const { result } = renderScheduler();
    expect(result.current[0]).toEqual([]);
  });

  it('should schedule and execute a tool call successfully', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    (mockTool.execute as Mock).mockResolvedValue({
      llmContent: 'Tool output',
      returnDisplay: 'Formatted tool output',
      summary: 'Formatted summary',
    } as ToolResult);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'mockTool',
      args: { param: 'value' },
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockTool.execute).toHaveBeenCalledWith(
      request.args,
      expect.any(AbortSignal),
      undefined,
    );
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request,
        response: expect.objectContaining({
          resultDisplay: 'Formatted tool output',
          responseParts: {
            functionResponse: {
              id: 'call1',
              name: 'mockTool',
              response: { output: 'Tool output' },
            },
          },
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it('should handle tool not found', async () => {
    mockToolRegistry.getTool.mockReturnValue(undefined);
    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'nonexistentTool',
      args: {},
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'error',
        request,
        response: expect.objectContaining({
          error: expect.objectContaining({
            message: 'Tool "nonexistentTool" not found in registry.',
          }),
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it('should handle error during shouldConfirmExecute', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    const confirmError = new Error('Confirmation check failed');
    (mockTool.shouldConfirmExecute as Mock).mockRejectedValue(confirmError);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'mockTool',
      args: {},
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'error',
        request,
        response: expect.objectContaining({
          error: confirmError,
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it('should handle error during execute', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);
    const execError = new Error('Execution failed');
    (mockTool.execute as Mock).mockRejectedValue(execError);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'mockTool',
      args: {},
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'error',
        request,
        response: expect.objectContaining({
          error: execError,
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it.skip('should handle tool requiring confirmation - approved', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const expectedOutput = 'Confirmed output';
    (mockToolRequiresConfirmation.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: 'Confirmed display',
      summary: 'Confirmed summary',
    } as ToolResult);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'callConfirm',
      name: 'mockToolRequiresConfirmation',
      args: { data: 'sensitive' },
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(setPendingHistoryItem).toHaveBeenCalled();
    expect(capturedOnConfirmForTest).toBeDefined();

    await act(async () => {
      await capturedOnConfirmForTest?.(ToolConfirmationOutcome.ProceedOnce);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockOnUserConfirmForToolConfirmation).toHaveBeenCalledWith(
      ToolConfirmationOutcome.ProceedOnce,
    );
    expect(mockToolRequiresConfirmation.execute).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request,
        response: expect.objectContaining({
          resultDisplay: 'Confirmed display',
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: { output: expectedOutput },
              }),
            }),
          ]),
        }),
      }),
    ]);
  });

  it.skip('should handle tool requiring confirmation - cancelled by user', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'callConfirmCancel',
      name: 'mockToolRequiresConfirmation',
      args: {},
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(setPendingHistoryItem).toHaveBeenCalled();
    expect(capturedOnConfirmForTest).toBeDefined();

    await act(async () => {
      await capturedOnConfirmForTest?.(ToolConfirmationOutcome.Cancel);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockOnUserConfirmForToolConfirmation).toHaveBeenCalledWith(
      ToolConfirmationOutcome.Cancel,
    );
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'cancelled',
        request,
        response: expect.objectContaining({
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: expect.objectContaining({
                  error: `User did not allow tool call ${request.name}. Reason: User cancelled.`,
                }),
              }),
            }),
          ]),
        }),
      }),
    ]);
  });

  it.skip('should handle live output updates', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolWithLiveOutput);
    let liveUpdateFn: ((output: string) => void) | undefined;
    let resolveExecutePromise: (value: ToolResult) => void;
    const executePromise = new Promise<ToolResult>((resolve) => {
      resolveExecutePromise = resolve;
    });

    (mockToolWithLiveOutput.execute as Mock).mockImplementation(
      async (
        _args: Record<string, unknown>,
        _signal: AbortSignal,
        updateFn: ((output: string) => void) | undefined,
      ) => {
        liveUpdateFn = updateFn;
        return executePromise;
      },
    );
    (mockToolWithLiveOutput.shouldConfirmExecute as Mock).mockResolvedValue(
      null,
    );

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'liveCall',
      name: 'mockToolWithLiveOutput',
      args: {},
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(liveUpdateFn).toBeDefined();
    expect(setPendingHistoryItem).toHaveBeenCalled();

    await act(async () => {
      liveUpdateFn?.('Live output 1');
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      liveUpdateFn?.('Live output 2');
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      resolveExecutePromise({
        llmContent: 'Final output',
        returnDisplay: 'Final display',
        summary: 'Final summary',
      } as ToolResult);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request,
        response: expect.objectContaining({
          resultDisplay: 'Final display',
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: { output: 'Final output' },
              }),
            }),
          ]),
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it('should schedule and execute multiple tool calls', async () => {
    const tool1 = new MockTool('tool1', 'Tool 1');
    tool1.execute.mockResolvedValue({
      llmContent: 'Output 1',
      returnDisplay: 'Display 1',
      summary: 'Summary 1',
    } as ToolResult);
    tool1.shouldConfirmExecute.mockResolvedValue(null);

    const tool2 = new MockTool('tool2', 'Tool 2');
    tool2.execute.mockResolvedValue({
      llmContent: 'Output 2',
      returnDisplay: 'Display 2',
      summary: 'Summary 2',
    } as ToolResult);
    tool2.shouldConfirmExecute.mockResolvedValue(null);

    mockToolRegistry.getTool.mockImplementation((name) => {
      if (name === 'tool1') return tool1;
      if (name === 'tool2') return tool2;
      return undefined;
    });

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const requests: ToolCallRequestInfo[] = [
      { callId: 'multi1', name: 'tool1', args: { p: 1 } },
      { callId: 'multi2', name: 'tool2', args: { p: 2 } },
    ];

    act(() => {
      schedule(requests, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const completedCalls = onComplete.mock.calls[0][0] as ToolCall[];
    expect(completedCalls.length).toBe(2);

    const call1Result = completedCalls.find(
      (c) => c.request.callId === 'multi1',
    );
    const call2Result = completedCalls.find(
      (c) => c.request.callId === 'multi2',
    );

    expect(call1Result).toMatchObject({
      status: 'success',
      request: requests[0],
      response: expect.objectContaining({
        resultDisplay: 'Display 1',
        responseParts: {
          functionResponse: {
            id: 'multi1',
            name: 'tool1',
            response: { output: 'Output 1' },
          },
        },
      }),
    });
    expect(call2Result).toMatchObject({
      status: 'success',
      request: requests[1],
      response: expect.objectContaining({
        resultDisplay: 'Display 2',
        responseParts: {
          functionResponse: {
            id: 'multi2',
            name: 'tool2',
            response: { output: 'Output 2' },
          },
        },
      }),
    });
    expect(result.current[0]).toEqual([]);
  });

  it.skip('should throw error if scheduling while already running', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    const longExecutePromise = new Promise<ToolResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            llmContent: 'done',
            returnDisplay: 'done display',
            summary: 'done summary',
          }),
        50,
      ),
    );
    (mockTool.execute as Mock).mockReturnValue(longExecutePromise);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request1: ToolCallRequestInfo = {
      callId: 'run1',
      name: 'mockTool',
      args: {},
    };
    const request2: ToolCallRequestInfo = {
      callId: 'run2',
      name: 'mockTool',
      args: {},
    };

    act(() => {
      schedule(request1, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(() => schedule(request2, new AbortController().signal)).toThrow(
      'Cannot schedule tool calls while other tool calls are running',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await vi.runAllTimersAsync();
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    });
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request: request1,
        response: expect.objectContaining({ resultDisplay: 'done display' }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });
});

describe('mapToDisplay', () => {
  const baseRequest: ToolCallRequestInfo = {
    callId: 'testCallId',
    name: 'testTool',
    args: { foo: 'bar' },
  };

  const baseTool = new MockTool('testTool', 'Test Tool Display');

  const baseResponse: ToolCallResponseInfo = {
    callId: 'testCallId',
    responseParts: [
      {
        functionResponse: {
          name: 'testTool',
          id: 'testCallId',
          response: { output: 'Test output' },
        } as FunctionResponse,
      } as PartUnion,
    ],
    resultDisplay: 'Test display output',
    summary: 'Test summary',
    error: undefined,
  };

  // Define a more specific type for extraProps for these tests
  // This helps ensure that tool and confirmationDetails are only accessed when they are expected to exist.
  type MapToDisplayExtraProps =
    | {
        tool?: AnyDeclarativeTool;
        invocation?: AnyToolInvocation;
        liveOutput?: string;
        response?: ToolCallResponseInfo;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        tool: AnyDeclarativeTool;
        invocation?: AnyToolInvocation;
        response?: ToolCallResponseInfo;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        response: ToolCallResponseInfo;
        tool?: undefined;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        confirmationDetails: ToolCallConfirmationDetails;
        tool?: AnyDeclarativeTool;
        invocation?: AnyToolInvocation;
        response?: ToolCallResponseInfo;
      };

  const baseInvocation = baseTool.build(baseRequest.args);
  const testCases: Array<{
    name: string;
    status: ToolCallStatusType;
    extraProps?: MapToDisplayExtraProps;
    expectedStatus: ToolCallStatus;
    expectedResultDisplay?: string;
    expectedName?: string;
    expectedDescription?: string;
  }> = [
    {
      name: 'validating',
      status: 'validating',
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'awaiting_approval',
      status: 'awaiting_approval',
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        confirmationDetails: {
          onConfirm: vi.fn(),
          type: 'edit',
          title: 'Test Tool Display',
          serverName: 'testTool',
          toolName: 'testTool',
          toolDisplayName: 'Test Tool Display',
          fileName: 'test.ts',
          fileDiff: 'Test diff',
          originalContent: 'Original content',
          newContent: 'New content',
        } as ToolCallConfirmationDetails,
      },
      expectedStatus: ToolCallStatus.Confirming,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'scheduled',
      status: 'scheduled',
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Pending,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'executing no live output',
      status: 'executing',
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'executing with live output',
      status: 'executing',
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        liveOutput: 'Live test output',
      },
      expectedStatus: ToolCallStatus.Executing,
      expectedResultDisplay: 'Live test output',
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'success',
      status: 'success',
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        response: baseResponse,
      },
      expectedStatus: ToolCallStatus.Success,
      expectedResultDisplay: baseResponse.resultDisplay as any,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'error tool not found',
      status: 'error',
      extraProps: {
        response: {
          ...baseResponse,
          error: new Error('Test error tool not found'),
          resultDisplay: 'Error display tool not found',
        },
      },
      expectedStatus: ToolCallStatus.Error,
      expectedResultDisplay: 'Error display tool not found',
      expectedName: baseRequest.name,
      expectedDescription: JSON.stringify(baseRequest.args),
    },
    {
      name: 'error tool execution failed',
      status: 'error',
      extraProps: {
        tool: baseTool,
        response: {
          ...baseResponse,
          error: new Error('Tool execution failed'),
          resultDisplay: 'Execution failed display',
        },
      },
      expectedStatus: ToolCallStatus.Error,
      expectedResultDisplay: 'Execution failed display',
      expectedName: baseTool.displayName, // Changed from baseTool.name
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'cancelled',
      status: 'cancelled',
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        response: {
          ...baseResponse,
          resultDisplay: 'Cancelled display',
        },
      },
      expectedStatus: ToolCallStatus.Canceled,
      expectedResultDisplay: 'Cancelled display',
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
  ];

  testCases.forEach(
    ({
      name: testName,
      status,
      extraProps,
      expectedStatus,
      expectedResultDisplay,
      expectedName,
      expectedDescription,
    }) => {
      it(`should map ToolCall with status '${status}' (${testName}) correctly`, () => {
        const toolCall: ToolCall = {
          request: baseRequest,
          status,
          ...(extraProps || {}),
        } as ToolCall;

        const display = mapToDisplay(toolCall);
        expect(display.type).toBe('tool_group');
        expect(display.tools.length).toBe(1);
        const toolDisplay = display.tools[0];

        expect(toolDisplay.callId).toBe(baseRequest.callId);
        expect(toolDisplay.status).toBe(expectedStatus);
        expect(toolDisplay.resultDisplay).toBe(expectedResultDisplay);

        expect(toolDisplay.name).toBe(expectedName);
        expect(toolDisplay.description).toBe(expectedDescription);

        expect(toolDisplay.renderOutputAsMarkdown).toBe(
          extraProps?.tool?.isOutputMarkdown ?? false,
        );
        if (status === 'awaiting_approval') {
          expect(toolDisplay.confirmationDetails).toBe(
            extraProps!.confirmationDetails,
          );
        } else {
          expect(toolDisplay.confirmationDetails).toBeUndefined();
        }
      });
    },
  );

  it('should map an array of ToolCalls correctly', () => {
    const toolCall1: ToolCall = {
      request: { ...baseRequest, callId: 'call1' },
      status: 'success',
      tool: baseTool,
      invocation: baseTool.build(baseRequest.args),
      response: { ...baseResponse, callId: 'call1' },
    } as ToolCall;
    const toolForCall2 = new MockTool(
      baseTool.name,
      baseTool.displayName,
      false,
      false,
      true,
    );
    const toolCall2: ToolCall = {
      request: { ...baseRequest, callId: 'call2' },
      status: 'executing',
      tool: toolForCall2,
      invocation: toolForCall2.build(baseRequest.args),
      liveOutput: 'markdown output',
    } as ToolCall;

    const display = mapToDisplay([toolCall1, toolCall2]);
    expect(display.tools.length).toBe(2);
    expect(display.tools[0].callId).toBe('call1');
    expect(display.tools[0].status).toBe(ToolCallStatus.Success);
    expect(display.tools[0].renderOutputAsMarkdown).toBe(false);
    expect(display.tools[1].callId).toBe('call2');
    expect(display.tools[1].status).toBe(ToolCallStatus.Executing);
    expect(display.tools[1].resultDisplay).toBe('markdown output');
    expect(display.tools[1].renderOutputAsMarkdown).toBe(true);
  });
});
