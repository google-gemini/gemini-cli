/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useReactToolScheduler,
  mapToDisplay,
} from './useReactToolScheduler.js';
import { PartUnion, FunctionResponse, PartListUnion } from '@google/genai';
import {
  Config,
  ToolCallRequestInfo,
  Tool,
  ToolRegistry,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolCallResponseInfo,
  ToolCall, // Import from core
  Status as ToolCallStatusType,
  ApprovalMode, // Import from core
} from '@google/gemini-cli-core';
import {
  HistoryItemWithoutId,
  ToolCallStatus,
  HistoryItemToolGroup,
} from '../types.js';

// Mocks
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');

  // Mock summarizeToolOutput directly to prevent deep dependencies causing timeouts
  const mockSummarizeToolOutput = vi.fn(
    async (content: string) => `Summarized: ${content.substring(0, 50)}...`,
  );

  // This needs to be a mock so we can control its behavior in tests
  const mockConvertToFunctionResponse = vi.fn(
    async (
      toolName: string,
      callId: string,
      llmContent: PartListUnion,
      config: Config, // Add config argument as per CoreToolScheduler's convertToFunctionResponse
      _abortSignal: AbortSignal, // Add abortSignal argument
    ): Promise<PartListUnion> => {
      // Adjusted mock to handle potential string or array for llmContent
      if (typeof llmContent === 'string') {
        if (
          toolName === 'run_shell_command' ||
          !(await config.getToolRegistry())
            .getAllTools()
            .map((t) => t.name)
            .includes(toolName)
        ) {
          // Use the mocked summarizeToolOutput here
          const summarizedContent = await mockSummarizeToolOutput(llmContent);
          return {
            functionResponse: {
              id: callId,
              name: toolName,
              response: { output: summarizedContent },
            },
          };
        }
        return {
          functionResponse: {
            id: callId,
            name: toolName,
            response: { output: llmContent },
          },
        };
      }
      if (Array.isArray(llmContent)) {
        const functionResponsePart = {
          functionResponse: {
            id: callId,
            name: toolName,
            response: { output: 'Tool execution succeeded.' },
          },
        };
        return [functionResponsePart, ...llmContent];
      }
      // Fallback for other PartListUnion types, though typically you'd handle more specific cases
      return {
        functionResponse: {
          id: callId,
          name: toolName,
          response: { output: 'Tool execution completed.' },
        },
      } as PartUnion;
    },
  );

  // Mock createErrorResponse to use the mocked summarizeToolOutput
  const mockCreateErrorResponse = vi.fn(
    async (
      request: ToolCallRequestInfo,
      error: Error,
    ): Promise<ToolCallResponseInfo> => {
      const summarizedContent = await mockSummarizeToolOutput(error.message); // Use the mocked function
      return {
        callId: request.callId,
        error,
        responseParts: {
          functionResponse: {
            id: request.callId,
            name: request.name,
            response: { error: summarizedContent },
          },
        },
        resultDisplay: summarizedContent,
      };
    },
  );

  return {
    ...actual,
    ToolRegistry: vi.fn(),
    Config: vi.fn(),
    convertToFunctionResponse: mockConvertToFunctionResponse,
    summarizeToolOutput: mockSummarizeToolOutput, // Export the mock as well
    createErrorResponse: mockCreateErrorResponse, // Export the mock as well
  };
});

const mockToolRegistry = {
  getTool: vi.fn(),
  getAllTools: vi.fn(() => []), // Added for the convertToFunctionResponse mock
};

const mockConfig = {
  getToolRegistry: vi.fn(() =>
    Promise.resolve(mockToolRegistry as unknown as ToolRegistry),
  ),
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
  // Ensure getGeminiClient is mocked, but its internal methods are less critical now summarizeToolOutput is mocked
  getGeminiClient: vi.fn(() => ({
    // Mock any methods that CoreToolScheduler might call on the client
    generateContent: vi.fn(() => Promise.resolve({ candidates: [] })), // Return a resolved promise
    // Add other methods if CoreToolScheduler calls them (e.g., streamGenerateContent)
  })),
};

const mockTool: Tool = {
  name: 'mockTool',
  displayName: 'Mock Tool',
  description: 'A mock tool for testing',
  isOutputMarkdown: false,
  canUpdateOutput: false,
  schema: {},
  validateToolParams: vi.fn(),
  execute: vi.fn(),
  shouldConfirmExecute: vi.fn(),
  getDescription: vi.fn((args) => `Description for ${JSON.stringify(args)}`),
};

const mockToolWithLiveOutput: Tool = {
  ...mockTool,
  name: 'mockToolWithLiveOutput',
  displayName: 'Mock Tool With Live Output',
  canUpdateOutput: true,
};

let mockOnUserConfirmForToolConfirmation: Mock;

const mockToolRequiresConfirmation: Tool = {
  ...mockTool,
  name: 'mockToolRequiresConfirmation',
  displayName: 'Mock Tool Requires Confirmation',
  shouldConfirmExecute: vi.fn(
    async (): Promise<ToolCallConfirmationDetails | false> => ({
      type: 'edit',
      title: 'Mock Tool Requires Confirmation',
      onConfirm: mockOnUserConfirmForToolConfirmation,
      fileName: 'mockToolRequiresConfirmation.ts',
      fileDiff: 'Mock tool requires confirmation',
    }),
  ),
};

describe('useReactToolScheduler in YOLO Mode', () => {
  let onComplete: Mock;
  let setPendingHistoryItem: Mock;

  beforeEach(() => {
    onComplete = vi.fn();
    setPendingHistoryItem = vi.fn();
    mockToolRegistry.getTool.mockClear();
    mockToolRegistry.getAllTools.mockClear(); // Clear this mock too
    (mockToolRequiresConfirmation.execute as Mock).mockClear();
    (mockToolRequiresConfirmation.shouldConfirmExecute as Mock).mockClear();
    (mockConfig.getGeminiClient as Mock).mockClear();

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
        vi.fn(),
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
      isClientInitiated: false,
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
      await vi.runAllTimersAsync();
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
    mockToolRegistry.getAllTools.mockClear(); // Clear this mock too
    (mockTool.execute as Mock).mockClear();
    (mockTool.shouldConfirmExecute as Mock).mockClear();
    (mockToolWithLiveOutput.execute as Mock).mockClear();
    (mockToolWithLiveOutput.shouldConfirmExecute as Mock).mockClear();
    (mockToolRequiresConfirmation.execute as Mock).mockClear();
    (mockToolRequiresConfirmation.shouldConfirmExecute as Mock).mockClear();
    // Reset mock for getGeminiClient for each test
    (mockConfig.getGeminiClient as Mock).mockClear();

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
        vi.fn(),
      ),
    );

  it('initial state should be empty', () => {
    const { result } = renderScheduler();
    expect(result.current[0]).toEqual([]);
  });

  it('should schedule and execute a tool call successfully', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool); // Ensure it's in the registry for convertToFunctionResponse check
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
      isClientInitiated: false,
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });

    waitFor(
      () => {
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
                  response: { output: 'Tool output' }, // This output is not summarized if toolName is not 'run_shell_command'
                },
              },
            }),
          }),
        ]);
        expect(result.current[0]).toEqual([]);
      },
      { timeout: 100 },
    ); // Increased timeout for this specific waitFor block
  }, 100); // Increased timeout for the test case itself

  it('should handle tool not found', async () => {
    mockToolRegistry.getTool.mockReturnValue(undefined);
    const { result } = renderScheduler();
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'nonExistentTool',
      args: {},
      isClientInitiated: false,
    };
    const schedule = result.current[1];
    act(() => {
      schedule(request, new AbortController().signal);
    });

    waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith([
          expect.objectContaining({
            status: 'error',
            request,
            response: expect.objectContaining({
              error: expect.objectContaining({
                message: 'Tool "nonExistentTool" not found in registry.',
              }),
              responseParts: {
                functionResponse: {
                  id: 'call1',
                  name: 'nonExistentTool',
                  response: {
                    error:
                      'Summarized: Tool "nonExistentTool" not found in registry....',
                  }, // Expect summarized error
                },
              },
            }),
          }),
        ]);
        expect(result.current[0]).toEqual([]);
      },
      { timeout: 100 },
    ); // Increased timeout for this specific waitFor block
  }, 100); // Increased timeout for the test case itself

  it('should handle error during shouldConfirmExecute', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    const confirmError = new Error('Confirmation check failed');
    (mockTool.shouldConfirmExecute as Mock).mockRejectedValue(confirmError);

    const { result } = renderScheduler();
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
    };
    const schedule = result.current[1];
    act(() => {
      schedule(request, new AbortController().signal);
    });

    waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith([
          expect.objectContaining({
            status: 'error',
            request,
            response: expect.objectContaining({
              error: confirmError,
              responseParts: {
                functionResponse: {
                  id: 'call1',
                  name: 'mockTool',
                  response: {
                    error: `Summarized: ${confirmError.message.substring(0, 50)}...`,
                  }, // Expect summarized error
                },
              },
            }),
          }),
        ]);
        expect(result.current[0]).toEqual([]);
      },
      { timeout: 100 },
    ); // Increased timeout for this specific waitFor block
  }, 100); // Increased timeout for the test case itself

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
      isClientInitiated: true,
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });

    waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith([
          expect.objectContaining({
            status: 'error',
            request,
            response: expect.objectContaining({
              error: execError,
              responseParts: {
                functionResponse: {
                  id: 'call1',
                  name: 'mockTool',
                  response: {
                    error: `Summarized: ${execError.message.substring(0, 50)}...`,
                  }, // Expect summarized error
                },
              },
            }),
          }),
        ]);
        expect(result.current[0]).toEqual([]);
      },
      { timeout: 100 },
    );
  }, 100);

  it.skip('should handle tool requiring confirmation - approved', async () => {
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
      isClientInitiated: false,
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });

    waitFor(() => {
      expect(setPendingHistoryItem).toHaveBeenCalled();
      expect(capturedOnConfirmForTest).toBeDefined();
    });

    // Act to simulate user confirmation
    await act(async () => {
      await capturedOnConfirmForTest?.(ToolConfirmationOutcome.ProceedOnce);
    });

    // Run timers again to process the tool execution after confirmation
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(
      () => {
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
      },
      { timeout: 100 },
    );
  }, 100); // Increased timeout for this test

  it.skip('should handle tool requiring confirmation - cancelled by user', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = {
      callId: 'callConfirmCancel',
      name: 'mockToolRequiresConfirmation',
      args: {},
      isClientInitiated: false,
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(setPendingHistoryItem).toHaveBeenCalled();
      expect(capturedOnConfirmForTest).toBeDefined();
    });

    await act(async () => {
      await capturedOnConfirmForTest?.(ToolConfirmationOutcome.Cancel);
    });
    await act(async () => {
      await vi.runAllTimersAsync(); // Run timers for the cancellation effect
    });

    await waitFor(
      () => {
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
                      error: `[Operation Cancelled] Reason: User did not allow tool call`, // Match the exact error message from CoreToolScheduler
                    }),
                  }),
                }),
              ]),
            }),
          }),
        ]);
      },
      { timeout: 100 },
    );
    expect(result.current[0]).toEqual([]);
  }, 100); // Increased timeout for this test

  it.skip('should handle live output updates', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolWithLiveOutput);
    let liveUpdateFn: ((output: string) => void) | undefined;
    let resolveExecutePromise: (value: ToolResult) => void;
    const executePromise = new Promise<ToolResult>((resolve) => {
      resolveExecutePromise = resolve;
    });

    (mockToolWithLiveOutput.execute as Mock).mockImplementation(
      async (
        _args: any,
        _signal: any,
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
      isClientInitiated: false,
    };

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(liveUpdateFn).toBeDefined();
      expect(setPendingHistoryItem).toHaveBeenCalled();
    });

    await act(async () => {
      liveUpdateFn?.('Live output 1');
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      liveUpdateFn?.('Live output 2');
      await vi.runAllTimersAsync();
    });

    act(() => {
      resolveExecutePromise({
        llmContent: 'Final output',
        returnDisplay: 'Final display',
      } as ToolResult);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith([
        expect.objectContaining({
          status: 'success',
          request,
          response: expect.objectContaining({
            resultDisplay: 'Final display',
            responseParts: expect.arrayContaining([
              expect.objectContaining({
                functionResponse: expect.objectContaining({
                  response: { output: 'Final output' }, // This output is not summarized if toolName is not 'run_shell_command'
                }),
              }),
            ]),
          }),
        }),
      ]);
    });
    expect(result.current[0]).toEqual([]);
  }, 100); // Increased timeout for this test

  it('should schedule and execute multiple tool calls', async () => {
    const tool1 = {
      ...mockTool,
      name: 'tool1',
      displayName: 'Tool 1',
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Output 1',
        returnDisplay: 'Display 1',
      } as ToolResult),
      shouldConfirmExecute: vi.fn().mockResolvedValue(null),
    };
    const tool2 = {
      ...mockTool,
      name: 'tool2',
      displayName: 'Tool 2',
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Output 2',
        returnDisplay: 'Display 2',
      } as ToolResult),
      shouldConfirmExecute: vi.fn().mockResolvedValue(null),
    };

    mockToolRegistry.getTool.mockImplementation((name) => {
      if (name === 'tool1') return tool1;
      if (name === 'tool2') return tool2;
      return undefined;
    });

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const requests: ToolCallRequestInfo[] = [
      {
        callId: 'multi1',
        name: 'tool1',
        args: { p: 1 },
        isClientInitiated: true,
      },
      {
        callId: 'multi2',
        name: 'tool2',
        args: { p: 2 },
        isClientInitiated: true,
      },
    ];

    act(() => {
      schedule(requests, new AbortController().signal);
    });

    waitFor(
      () => {
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
      },
      { timeout: 100 }, // Increased timeout for this test
    );
  }, 100); // Increased timeout for the test case itself

  it.skip('should throw error if scheduling while already running', async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    const longExecutePromise = new Promise<ToolResult>((resolve) =>
      setTimeout(
        () => resolve({ llmContent: 'done', returnDisplay: 'done display' }),
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
      isClientInitiated: true,
    };
    const request2: ToolCallRequestInfo = {
      callId: 'run2',
      name: 'mockTool',
      args: {},
      isClientInitiated: true,
    };

    act(() => {
      schedule(request1, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync(); // Process the first scheduling
    });

    expect(() => schedule(request2, new AbortController().signal)).toThrow(
      'Cannot schedule tool calls while other tool calls are running',
    );

    // Now, let the first scheduled call complete so that afterEach can clean up properly.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await vi.runAllTimersAsync();
    });

    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith([
          expect.objectContaining({
            status: 'success',
            request: request1,
            response: expect.objectContaining({
              resultDisplay: 'done display',
            }),
          }),
        ]);
        expect(result.current[0]).toEqual([]);
      },
      { timeout: 100 },
    ); // Increased timeout for this specific waitFor block
  }, 100); // Increased timeout for the test case itself
});

describe('mapToDisplay', () => {
  const baseRequest: ToolCallRequestInfo = {
    callId: 'testCallId',
    name: 'testTool',
    args: { foo: 'bar' },
    isClientInitiated: true,
  };

  const baseTool: Tool = {
    name: 'testTool',
    displayName: 'Test Tool Display',
    description: 'Test Description',
    isOutputMarkdown: false,
    canUpdateOutput: false,
    schema: {},
    validateToolParams: vi.fn(),
    execute: vi.fn(),
    shouldConfirmExecute: vi.fn(),
    getDescription: vi.fn((args) => `Desc: ${JSON.stringify(args)}`),
  };

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
  };

  // Define a more specific type for extraProps for these tests
  // This helps ensure that tool and confirmationDetails are only accessed when they are expected to exist.
  type MapToDisplayExtraProps =
    | {
        tool?: Tool;
        liveOutput?: string;
        response?: ToolCallResponseInfo;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        tool: Tool;
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
        tool?: Tool;
        response?: ToolCallResponseInfo;
      };

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
      extraProps: { tool: baseTool },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'awaiting_approval',
      status: 'awaiting_approval',
      extraProps: {
        tool: baseTool,
        confirmationDetails: {
          onConfirm: vi.fn(),
          type: 'edit',
          title: 'Test Tool Display',
          serverName: 'testTool',
          toolName: 'testTool',
          toolDisplayName: 'Test Tool Display',
          fileName: 'test.ts',
          fileDiff: 'Test diff',
        } as ToolCallConfirmationDetails,
      },
      expectedStatus: ToolCallStatus.Confirming,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'scheduled',
      status: 'scheduled',
      extraProps: { tool: baseTool },
      expectedStatus: ToolCallStatus.Pending,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'executing no live output',
      status: 'executing',
      extraProps: { tool: baseTool },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'executing with live output',
      status: 'executing',
      extraProps: { tool: baseTool, liveOutput: 'Live test output' },
      expectedStatus: ToolCallStatus.Executing,
      expectedResultDisplay: 'Live test output',
      expectedName: baseTool.displayName,
      expectedDescription: baseTool.getDescription(baseRequest.args),
    },
    {
      name: 'success',
      status: 'success',
      extraProps: { tool: baseTool, response: baseResponse },
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
      response: { ...baseResponse, callId: 'call1' },
    } as ToolCall;
    const toolCall2: ToolCall = {
      request: { ...baseRequest, callId: 'call2' },
      status: 'executing',
      tool: { ...baseTool, isOutputMarkdown: true },
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
