/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import {
  useReactToolScheduler,
  mapToDisplay,
} from './useReactToolScheduler.js';
import type { PartUnion, FunctionResponse } from '@google/genai';
import type {
  Config,
  ToolCallRequestInfo,
  ToolRegistry,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolCallResponseInfo,
  ToolCall, // Import from core
  Status as ToolCallStatusType,
  AnyDeclarativeTool,
  AnyToolInvocation,
} from '@google/gemini-cli-core';
import {
  DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
  ToolConfirmationOutcome,
  ApprovalMode,
  MockTool,
} from '@google/gemini-cli-core';
import { ToolCallStatus } from '../types.js';

// Mocks
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual<any>('@google/gemini-cli-core');
  // Patch CoreToolScheduler to have cancelAll if it's missing in the test environment
  if (
    actual.CoreToolScheduler &&
    !actual.CoreToolScheduler.prototype.cancelAll
  ) {
    actual.CoreToolScheduler.prototype.cancelAll = vi.fn();
  }
  return {
    ...actual,
    ToolRegistry: vi.fn(),
    Config: vi.fn(),
  };
});

const mockToolRegistry = {
  getTool: vi.fn(),
  getAllToolNames: vi.fn(() => ['mockTool', 'anotherTool']),
};

const mockConfig = {
  getToolRegistry: vi.fn(() => mockToolRegistry as unknown as ToolRegistry),
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  getSessionId: () => 'test-session-id',
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
  storage: {
    getProjectTempDir: () => '/tmp',
  },
  getTruncateToolOutputThreshold: () => DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
  getTruncateToolOutputLines: () => DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
  getAllowedTools: vi.fn(() => []),
  getContentGeneratorConfig: () => ({
    model: 'test-model',
    authType: 'oauth-personal',
  }),
  getUseSmartEdit: () => false,
  getUseModelRouter: () => false,
  getGeminiClient: () => null, // No client needed for these tests
  getShellExecutionConfig: () => ({ terminalWidth: 80, terminalHeight: 24 }),
  getEnableMessageBusIntegration: () => false,
  getMessageBus: () => null,
  getPolicyEngine: () => null,
} as unknown as Config;

const mockTool = new MockTool({
  name: 'mockTool',
  displayName: 'Mock Tool',
  execute: vi.fn(),
  shouldConfirmExecute: vi.fn(),
});
const mockToolWithLiveOutput = new MockTool({
  name: 'mockToolWithLiveOutput',
  displayName: 'Mock Tool With Live Output',
  description: 'A mock tool for testing',
  params: {},
  isOutputMarkdown: true,
  canUpdateOutput: true,
  execute: vi.fn(),
  shouldConfirmExecute: vi.fn(),
});
let mockOnUserConfirmForToolConfirmation: Mock;
const mockToolRequiresConfirmation = new MockTool({
  name: 'mockToolRequiresConfirmation',
  displayName: 'Mock Tool Requires Confirmation',
  execute: vi.fn(),
  shouldConfirmExecute: vi.fn(),
});

describe('useReactToolScheduler in YOLO Mode', () => {
  let onComplete: Mock;

  beforeEach(() => {
    onComplete = vi.fn();
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
        () => undefined,
        () => {},
      ),
    );

  it('should skip confirmation and execute tool directly when yoloMode is true', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const expectedOutput = 'YOLO Confirmed output';
    (mockToolRequiresConfirmation.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: 'YOLO Formatted tool output',
    } as ToolResult);

    const { result } = renderSchedulerInYoloMode();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'yoloCall',
      name: 'mockToolRequiresConfirmation',
      args: { data: 'any data' },
    } as any;

    act(() => {
      schedule(request, new AbortController().signal);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // Process validation
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // Process scheduling
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // Process execution
    });

    // Check that execute WAS called
    expect(mockToolRequiresConfirmation.execute).toHaveBeenCalledWith(
      request.args,
    );

    // Check that onComplete was called with success
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request,
        response: expect.objectContaining({
          resultDisplay: 'YOLO Formatted tool output',
          responseParts: [
            {
              functionResponse: {
                id: 'yoloCall',
                name: 'mockToolRequiresConfirmation',
                response: { output: expectedOutput },
              },
            },
          ],
        }),
      }),
    ]);
  });
});

describe('useReactToolScheduler', () => {
  let onComplete: Mock;
  let capturedOnConfirmForTest:
    | ((outcome: ToolConfirmationOutcome) => void | Promise<void>)
    | undefined;

  const advanceAndSettle = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  const scheduleAndWaitForExecution = async (
    schedule: (
      req: ToolCallRequestInfo | ToolCallRequestInfo[],
      signal: AbortSignal,
    ) => void,
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
  ) => {
    act(() => {
      schedule(request, new AbortController().signal);
    });

    await advanceAndSettle();
    await advanceAndSettle();
    await advanceAndSettle();
  };

  beforeEach(() => {
    onComplete = vi.fn();
    capturedOnConfirmForTest = undefined;

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
      async (): Promise<ToolCallConfirmationDetails | null> =>
        ({
          onConfirm: mockOnUserConfirmForToolConfirmation,
          fileName: 'mockToolRequiresConfirmation.ts',
          fileDiff: 'Mock tool requires confirmation',
          type: 'edit',
          title: 'Mock Tool Requires Confirmation',
        }) as any,
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
        () => undefined,
        () => {},
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
    } as ToolResult);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'mockTool',
      args: { param: 'value' },
    } as any;

    let completedToolCalls: ToolCall[] = [];
    onComplete.mockImplementation((calls) => {
      completedToolCalls = calls;
    });

    await scheduleAndWaitForExecution(result.current[1], request);

    expect(mockTool.execute).toHaveBeenCalledWith(request.args);
    expect(completedToolCalls).toHaveLength(1);
    expect(completedToolCalls[0].status).toBe('success');
    expect(completedToolCalls[0].request).toBe(request);

    if (
      completedToolCalls[0].status === 'success' ||
      completedToolCalls[0].status === 'error'
    ) {
      expect(completedToolCalls[0].response).toMatchSnapshot();
    }
  });

  it('should clear previous tool calls when scheduling new ones', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    (mockTool.execute as Mock).mockResolvedValue({
      llmContent: 'Tool output',
      returnDisplay: 'Formatted tool output',
    } as ToolResult);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const setToolCallsForDisplay = result.current[3];

    // Manually set a tool call in the display.
    const oldToolCall = {
      request: { callId: 'oldCall' },
      status: 'success',
    } as any;
    act(() => {
      setToolCallsForDisplay([oldToolCall]);
    });
    expect(result.current[0]).toEqual([oldToolCall]);

    const newRequest: ToolCallRequestInfo = {
      callId: 'newCall',
      name: 'mockTool',
      args: {},
    } as any;
    act(() => {
      schedule(newRequest, new AbortController().signal);
    });

    // After scheduling, the old call should be gone,
    // and the new one should be in the display in its initial state.
    expect(result.current[0].length).toBe(1);
    expect(result.current[0][0].request.callId).toBe('newCall');
    expect(result.current[0][0].request.callId).not.toBe('oldCall');

    // Let the new call finish.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it('should cancel all running tool calls', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);

    let resolveExecute: (value: ToolResult) => void = () => {};
    const executePromise = new Promise<ToolResult>((resolve) => {
      resolveExecute = resolve;
    });
    (mockTool.execute as Mock).mockReturnValue(executePromise);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const cancelAllToolCalls = result.current[4];
    const request: ToolCallRequestInfo = {
      callId: 'cancelCall',
      name: 'mockTool',
      args: {},
    } as any;

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    }); // validation
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // Process scheduling
    });

    // At this point, the tool is 'executing' and waiting on the promise.
    expect(result.current[0][0].status).toBe('executing');

    const cancelController = new AbortController();
    act(() => {
      cancelAllToolCalls(cancelController.signal);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'cancelled',
        request,
      }),
    ]);

    // Clean up the pending promise to avoid open handles.
    await act(async () => {
      resolveExecute({ llmContent: 'output', returnDisplay: 'display' });
    });
  });

  it.each([
    {
      desc: 'tool not found',
      setup: () => {
        mockToolRegistry.getTool.mockReturnValue(undefined);
      },
      request: {
        callId: 'call1',
        name: 'nonexistentTool',
        args: {},
      } as any,
      expectedErrorContains: [
        'Tool "nonexistentTool" not found in registry',
        'Did you mean one of:',
      ],
    },
    {
      desc: 'error during shouldConfirmExecute',
      setup: () => {
        mockToolRegistry.getTool.mockReturnValue(mockTool);
        const confirmError = new Error('Confirmation check failed');
        (mockTool.shouldConfirmExecute as Mock).mockRejectedValue(confirmError);
      },
      request: {
        callId: 'call1',
        name: 'mockTool',
        args: {},
      } as any,
      expectedError: new Error('Confirmation check failed'),
    },
    {
      desc: 'error during execute',
      setup: () => {
        mockToolRegistry.getTool.mockReturnValue(mockTool);
        (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);
        const execError = new Error('Execution failed');
        (mockTool.execute as Mock).mockRejectedValue(execError);
      },
      request: {
        callId: 'call1',
        name: 'mockTool',
        args: {},
      } as any,
      expectedError: new Error('Execution failed'),
    },
  ])(
    'should handle $desc',
    async ({ setup, request, expectedErrorContains, expectedError }) => {
      setup();
      const { result } = renderScheduler();

      let completedToolCalls: ToolCall[] = [];
      onComplete.mockImplementation((calls) => {
        completedToolCalls = calls;
      });

      await scheduleAndWaitForExecution(result.current[1], request);

      expect(completedToolCalls).toHaveLength(1);
      expect(completedToolCalls[0].status).toBe('error');
      expect(completedToolCalls[0].request).toBe(request);

      if (expectedErrorContains) {
        expectedErrorContains.forEach((errorText) => {
          expect(
            (completedToolCalls[0] as any).response.error.message,
          ).toContain(errorText);
        });
      }

      if (expectedError) {
        expect((completedToolCalls[0] as any).response.error.message).toBe(
          expectedError.message,
        );
      }
    },
  );

  it('should handle tool requiring confirmation - approved', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const expectedOutput = 'Confirmed output';
    (mockToolRequiresConfirmation.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: 'Confirmed display',
    } as ToolResult);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'callConfirm',
      name: 'mockToolRequiresConfirmation',
      args: { data: 'sensitive' },
    } as any;

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await advanceAndSettle();

    const waitingCall = result.current[0][0] as any;
    expect(waitingCall.status).toBe('awaiting_approval');
    capturedOnConfirmForTest = waitingCall.confirmationDetails?.onConfirm;
    expect(capturedOnConfirmForTest).toBeDefined();

    await act(async () => {
      await capturedOnConfirmForTest?.(ToolConfirmationOutcome.ProceedOnce);
    });

    await advanceAndSettle();
    await advanceAndSettle();
    await advanceAndSettle();

    expect(mockOnUserConfirmForToolConfirmation).toHaveBeenCalledWith(
      ToolConfirmationOutcome.ProceedOnce,
    );
    expect(mockToolRequiresConfirmation.execute).toHaveBeenCalled();

    const completedCalls = onComplete.mock.calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('success');
    expect(completedCalls[0].request).toBe(request);
    if (
      completedCalls[0].status === 'success' ||
      completedCalls[0].status === 'error'
    ) {
      expect(completedCalls[0].response).toMatchSnapshot();
    }
  });

  it('should handle tool requiring confirmation - cancelled by user', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'callConfirmCancel',
      name: 'mockToolRequiresConfirmation',
      args: {},
    } as any;

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await advanceAndSettle();

    const waitingCall = result.current[0][0] as any;
    expect(waitingCall.status).toBe('awaiting_approval');
    capturedOnConfirmForTest = waitingCall.confirmationDetails?.onConfirm;
    expect(capturedOnConfirmForTest).toBeDefined();

    await act(async () => {
      await capturedOnConfirmForTest?.(ToolConfirmationOutcome.Cancel);
    });
    await advanceAndSettle();
    await advanceAndSettle();

    expect(mockOnUserConfirmForToolConfirmation).toHaveBeenCalledWith(
      ToolConfirmationOutcome.Cancel,
    );

    const completedCalls = onComplete.mock.calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('cancelled');
    expect(completedCalls[0].request).toBe(request);
    if (
      completedCalls[0].status === 'success' ||
      completedCalls[0].status === 'error' ||
      completedCalls[0].status === 'cancelled'
    ) {
      expect(completedCalls[0].response).toMatchSnapshot();
    }
  });

  it('should handle live output updates', async () => {
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
    const request: ToolCallRequestInfo = {
      callId: 'liveCall',
      name: 'mockToolWithLiveOutput',
      args: {},
    } as any;

    act(() => {
      result.current[1](request, new AbortController().signal);
    });
    await advanceAndSettle();

    expect(liveUpdateFn).toBeDefined();
    expect(result.current[0][0].status).toBe('executing');

    await act(async () => {
      liveUpdateFn?.('Live output 1');
    });
    await advanceAndSettle();

    await act(async () => {
      liveUpdateFn?.('Live output 2');
    });
    await advanceAndSettle();

    act(() => {
      resolveExecutePromise({
        llmContent: 'Final output',
        returnDisplay: 'Final display',
      } as ToolResult);
    });
    await advanceAndSettle();
    await advanceAndSettle();

    const completedCalls = onComplete.mock.calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('success');
    expect(completedCalls[0].request).toBe(request);
    if (
      completedCalls[0].status === 'success' ||
      completedCalls[0].status === 'error'
    ) {
      expect(completedCalls[0].response).toMatchSnapshot();
    }
    expect(result.current[0]).toEqual([]);
  });

  it('should schedule and execute multiple tool calls', async () => {
    const tool1 = new MockTool({
      name: 'tool1',
      displayName: 'Tool 1',
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Output 1',
        returnDisplay: 'Display 1',
      } as ToolResult),
    });

    const tool2 = new MockTool({
      name: 'tool2',
      displayName: 'Tool 2',
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Output 2',
        returnDisplay: 'Display 2',
      } as ToolResult),
    });

    mockToolRegistry.getTool.mockImplementation((name) => {
      if (name === 'tool1') return tool1;
      if (name === 'tool2') return tool2;
      return undefined;
    });

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const requests: ToolCallRequestInfo[] = [
      { callId: 'multi1', name: 'tool1', args: { p: 1 } } as any,
      { callId: 'multi2', name: 'tool2', args: { p: 2 } } as any,
    ];

    act(() => {
      schedule(requests, new AbortController().signal);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
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
        responseParts: [
          {
            functionResponse: {
              id: 'multi1',
              name: 'tool1',
              response: { output: 'Output 1' },
            },
          },
        ],
      }),
    });
    expect(call2Result).toMatchObject({
      status: 'success',
      request: requests[1],
      response: expect.objectContaining({
        resultDisplay: 'Display 2',
        responseParts: [
          {
            functionResponse: {
              id: 'multi2',
              name: 'tool2',
              response: { output: 'Output 2' },
            },
          },
        ],
      }),
    });

    expect(completedCalls).toHaveLength(2);
    expect(completedCalls.every((t) => t.status === 'success')).toBe(true);
  });

  it('should queue if scheduling while already running', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    const longExecutePromise = new Promise<ToolResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            llmContent: 'done',
            returnDisplay: 'done display',
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
    } as any;
    const request2: ToolCallRequestInfo = {
      callId: 'run2',
      name: 'mockTool',
      args: {},
    } as any;

    act(() => {
      schedule(request1, new AbortController().signal);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      schedule(request2, new AbortController().signal);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    });
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request: request1,
        response: expect.objectContaining({ resultDisplay: 'done display' }),
      }),
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    });
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request: request2,
        response: expect.objectContaining({ resultDisplay: 'done display' }),
      }),
    ]);
    const toolCalls = result.current[0];
    expect(toolCalls).toHaveLength(0);
  });
});

describe('mapToDisplay', () => {
  const baseRequest: ToolCallRequestInfo = {
    callId: 'testCallId',
    name: 'testTool',
    args: { foo: 'bar' },
  } as any;

  const baseTool = new MockTool({
    name: 'testTool',
    displayName: 'Test Tool Display',
    execute: vi.fn(),
    shouldConfirmExecute: vi.fn(),
  });

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
    error: undefined,
  } as any;

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
      expectedDescription: baseInvocation.getDescription(),
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
          filePath: 'mock',
          fileName: 'test.ts',
          fileDiff: 'Test diff',
          originalContent: 'Original content',
          newContent: 'New content',
        } as ToolCallConfirmationDetails,
      },
      expectedStatus: ToolCallStatus.Confirming,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: 'scheduled',
      status: 'scheduled',
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Pending,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: 'executing no live output',
      status: 'executing',
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
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
      expectedDescription: baseInvocation.getDescription(),
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
      expectedDescription: baseInvocation.getDescription(),
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
      expectedDescription: JSON.stringify(baseRequest.args),
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
      expectedDescription: baseInvocation.getDescription(),
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
    const toolForCall2 = new MockTool({
      name: baseTool.name,
      displayName: baseTool.displayName,
      isOutputMarkdown: true,
      execute: vi.fn(),
      shouldConfirmExecute: vi.fn(),
    });
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
