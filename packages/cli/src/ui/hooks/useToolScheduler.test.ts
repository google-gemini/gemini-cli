/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
  ApprovalMode,
  MockTool,
} from '@google/gemini-cli-core';
import { ToolCallStatus } from '../types.js';

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

describe('useReactToolScheduler in YOLO Mode', () => {
  let onComplete: Mock;

  // Create a tool that would normally require confirmation
  const mockToolNeedsConfirm = new MockTool({
    name: 'mockToolNeedsConfirm',
    displayName: 'Mock Tool Needs Confirm',
    execute: vi.fn(),
    shouldConfirmExecute: vi.fn(),
  });

  beforeEach(() => {
    onComplete = vi.fn();
    mockToolRegistry.getTool.mockClear();
    (mockToolNeedsConfirm.execute as Mock).mockClear();
    (mockToolNeedsConfirm.shouldConfirmExecute as Mock).mockClear();

    // Setup mock to return confirmation details (which YOLO mode should skip)
    (mockToolNeedsConfirm.shouldConfirmExecute as Mock).mockImplementation(
      async (): Promise<ToolCallConfirmationDetails | null> =>
        ({
          onConfirm: vi.fn(),
          fileName: 'test.ts',
          fileDiff: 'Mock diff',
          type: 'edit',
          title: 'Mock Confirmation',
        }) as any,
    );

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
    mockToolRegistry.getTool.mockReturnValue(mockToolNeedsConfirm);
    const expectedOutput = 'YOLO Confirmed output';
    (mockToolNeedsConfirm.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: 'YOLO Formatted tool output',
    } as ToolResult);

    const { result } = renderSchedulerInYoloMode();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'yoloCall',
      name: 'mockToolNeedsConfirm',
      args: { data: 'any data' },
    } as any;

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

    // Check that execute WAS called (confirmation was skipped)
    expect(mockToolNeedsConfirm.execute).toHaveBeenCalledWith(request.args);

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
                name: 'mockToolNeedsConfirm',
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

  beforeEach(() => {
    onComplete = vi.fn();

    mockToolRegistry.getTool.mockClear();
    (mockTool.execute as Mock).mockClear();
    (mockTool.shouldConfirmExecute as Mock).mockClear();
    (mockToolWithLiveOutput.execute as Mock).mockClear();
    (mockToolWithLiveOutput.shouldConfirmExecute as Mock).mockClear();

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
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'mockTool',
      args: { param: 'value' },
    } as any;

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

    expect(mockTool.execute).toHaveBeenCalledWith(request.args);
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request,
        response: expect.objectContaining({
          resultDisplay: 'Formatted tool output',
          responseParts: [
            {
              functionResponse: {
                id: 'call1',
                name: 'mockTool',
                response: { output: 'Tool output' },
              },
            },
          ],
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
    } as any;

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
            message: expect.stringMatching(
              /Tool "nonexistentTool" not found in registry/,
            ),
          }),
        }),
      }),
    ]);
    const errorMessage = onComplete.mock.calls[0][0][0].response.error.message;
    expect(errorMessage).toContain('Did you mean one of:');
    expect(errorMessage).toContain('"mockTool"');
    expect(errorMessage).toContain('"anotherTool"');
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
    } as any;

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
    } as any;

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

  // NOTE: Confirmation tests removed as they were testing an obsolete API.
  // Tool confirmation flow is now handled entirely within CoreToolScheduler
  // and is tested in packages/core/src/core/coreToolScheduler.test.ts
  // The useReactToolScheduler hook simply displays the tool call states
  // including 'awaiting_approval' status which is mapped to ToolCallStatus.Confirming.

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
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'liveCall',
      name: 'mockToolWithLiveOutput',
      args: {},
    } as any;

    act(() => {
      schedule(request, new AbortController().signal);
    });

    // Wait for validation and execution to start
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(liveUpdateFn).toBeDefined();

    // Send live output updates
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

    // Resolve the execution promise
    await act(async () => {
      resolveExecutePromise!({
        llmContent: 'Final output',
        returnDisplay: 'Final display',
      } as ToolResult);
    });

    // Wait for completion to propagate
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
    expect(result.current[0]).toEqual([]);
  });

  it('should handle multiple sequential tool executions correctly', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    let resolveExecutePromise: (value: ToolResult) => void;
    const longExecutePromise = new Promise<ToolResult>((resolve) => {
      resolveExecutePromise = resolve;
    });
    (mockTool.execute as Mock).mockReturnValueOnce(longExecutePromise);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request1: ToolCallRequestInfo = {
      callId: 'run1',
      name: 'mockTool',
      args: {},
    } as any;

    // Schedule first tool call
    act(() => {
      schedule(request1, new AbortController().signal);
    });

    // Wait for validation and execution to start
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Complete the first execution
    await act(async () => {
      resolveExecutePromise!({
        llmContent: 'done',
        returnDisplay: 'done display',
      });
    });

    // Wait for completion to propagate
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'success',
        request: request1,
        response: expect.objectContaining({ resultDisplay: 'done display' }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);

    // Now schedule a second tool after the first completes
    const request2: ToolCallRequestInfo = {
      callId: 'run2',
      name: 'mockTool',
      args: {},
    } as any;

    (mockTool.execute as Mock).mockResolvedValueOnce({
      llmContent: 'done2',
      returnDisplay: 'done display 2',
    } as ToolResult);

    onComplete.mockClear();

    act(() => {
      schedule(request2, new AbortController().signal);
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
        status: 'success',
        request: request2,
        response: expect.objectContaining({ resultDisplay: 'done display 2' }),
      }),
    ]);
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
