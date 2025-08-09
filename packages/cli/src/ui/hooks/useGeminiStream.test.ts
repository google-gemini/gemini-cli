/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeminiStream } from './useGeminiStream.js';
import { useInput, type Key as InkKey } from 'ink';
import { SessionStatsProvider } from '../contexts/SessionContext.js';
import {
  Config,
  GeminiClient,
  ToolRegistry,
  ToolCallRequestInfo,
  ToolResult,
  BaseTool,
  Icon,
  ApprovalMode,
  UnauthorizedError,
} from '@google/gemini-cli-core';
import { ToolCallStatus, StreamingState, MessageType } from '../types.js';

// Mocks
vi.mock('ink');

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    Config: vi.fn(),
    GeminiClient: vi.fn(),
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
  getModel: vi.fn(() => 'test-model'),
  getContentGeneratorConfig: vi.fn(() => ({ authType: 'api_key' })),
  getProjectRoot: vi.fn(() => '/test/project'),
  getProjectTempDir: vi.fn(() => '/test/temp'),
  getCheckpointingEnabled: vi.fn(() => false),
  getSessionId: vi.fn(() => 'test-session-id'),
  getMaxSessionTurns: vi.fn(() => 10),
  setQuotaErrorOccurred: vi.fn(),
};

const mockGeminiClient = {
  sendMessageStream: vi.fn(),
  addHistory: vi.fn(),
  getHistory: vi.fn(),
};

class MockTool extends BaseTool<object, ToolResult> {
  constructor(name: string, displayName: string) {
    super(
      name,
      displayName,
      'A mock tool for testing',
      Icon.Hammer,
      {},
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  execute = vi.fn();
  shouldConfirmExecute = vi.fn();
}

const mockTool = new MockTool('mockTool', 'Mock Tool');

type UseInputKey = InkKey;
type UseInputHandler = (input: string, key: UseInputKey) => void;

describe('useGeminiStream', () => {
  let capturedUseInputHandler: UseInputHandler;
  let mockedInkUseInput: Mock<any, any>;
  let onDebugMessage: Mock;
  let handleSlashCommand: Mock;
  let addItem: Mock;
  let onAuthError: Mock;
  let performMemoryRefresh: Mock;
  let setModelSwitchedFromQuotaError: Mock;
  let onEditorClose: Mock;
  let onCancelSubmit: Mock;
  let getPreferredEditor: Mock;

  beforeEach(() => {
    vi.resetAllMocks();

    mockedInkUseInput = useInput as Mock<any, any>;
    mockedInkUseInput.mockImplementation((handler: UseInputHandler) => {
      capturedUseInputHandler = handler;
    });

    onDebugMessage = vi.fn();
    handleSlashCommand = vi.fn();
    addItem = vi.fn();
    onAuthError = vi.fn();
    performMemoryRefresh = vi.fn();
    setModelSwitchedFromQuotaError = vi.fn();
    onEditorClose = vi.fn();
    onCancelSubmit = vi.fn();
    getPreferredEditor = vi.fn();

    // Setup mocks for Config
    (Config as any).mockImplementation(() => mockConfig);

    // Setup mocks for GeminiClient
    (GeminiClient as any).mockImplementation(() => mockGeminiClient);

    // Setup tool registry
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    (mockTool.execute as Mock).mockResolvedValue({
      llmContent: 'Tool output',
      returnDisplay: 'Formatted tool output',
      summary: 'Formatted summary',
    } as ToolResult);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const renderUseGeminiStream = () =>
    renderHook(
      () =>
        useGeminiStream(
          mockGeminiClient as unknown as GeminiClient,
          [],
          addItem,
          mockConfig as unknown as Config,
          onDebugMessage,
          handleSlashCommand,
          false, // shellModeActive
          getPreferredEditor,
          onAuthError,
          performMemoryRefresh,
          false, // modelSwitchedFromQuotaError
          setModelSwitchedFromQuotaError,
          onEditorClose,
          onCancelSubmit,
        ),
      {
        wrapper: SessionStatsProvider,
      },
    );

  it('should initialize with correct initial state', () => {
    const { result } = renderUseGeminiStream();
    expect(result.current.streamingState).toBe(StreamingState.Idle);
    expect(result.current.initError).toBeNull();
    expect(result.current.pendingHistoryItems).toEqual([]);
    expect(result.current.thought).toBeNull();
  });

  it('should handle Ctrl-C to cancel request when responding', async () => {
    const { result } = renderUseGeminiStream();

    // Mock a stream that takes some time to complete
    const mockStream = {
      [Symbol.asyncIterator]() {
        return {
          next: vi.fn().mockImplementation(
            () =>
              new Promise((resolve) => {
                setTimeout(() => {
                  resolve({
                    done: true,
                    value: {
                      type: 'finished',
                      value: 'stop',
                    },
                  });
                }, 100);
              }),
          ),
        };
      },
    };

    mockGeminiClient.sendMessageStream.mockReturnValue(mockStream);

    // Start a query
    await act(async () => {
      result.current.submitQuery('Test query');
      // Wait a bit for the streaming state to update
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Verify we're in responding state
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // Simulate Ctrl-C keypress
    act(() => {
      capturedUseInputHandler('c', { ctrl: true } as InkKey);
    });

    // Verify cancelRequest was called
    expect(onCancelSubmit).toHaveBeenCalled();
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Request cancelled.',
      }),
      expect.any(Number),
    );
  });

  it('should handle Escape key to cancel request when responding', async () => {
    const { result } = renderUseGeminiStream();

    // Mock a stream that takes some time to complete
    const mockStream = {
      [Symbol.asyncIterator]() {
        return {
          next: vi.fn().mockImplementation(
            () =>
              new Promise((resolve) => {
                setTimeout(() => {
                  resolve({
                    done: true,
                    value: {
                      type: 'finished',
                      value: 'stop',
                    },
                  });
                }, 100);
              }),
          ),
        };
      },
    };

    mockGeminiClient.sendMessageStream.mockReturnValue(mockStream);

    // Start a query
    await act(async () => {
      result.current.submitQuery('Test query');
      // Wait a bit for the streaming state to update
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Verify we're in responding state
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // Simulate Escape keypress
    act(() => {
      capturedUseInputHandler('', { escape: true } as InkKey);
    });

    // Verify cancelRequest was called
    expect(onCancelSubmit).toHaveBeenCalled();
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Request cancelled.',
      }),
      expect.any(Number),
    );
  });

  it('should cancel pending tool calls when request is cancelled', async () => {
    const { result } = renderUseGeminiStream();

    // Mock a stream that requests a tool call
    const mockStream = {
      [Symbol.asyncIterator]() {
        return {
          next: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: {
                type: 'tool_call_request',
                value: {
                  callId: 'test-call-id',
                  name: 'mockTool',
                  args: { param: 'value' },
                  isClientInitiated: false,
                } as ToolCallRequestInfo,
              },
            })
            .mockResolvedValueOnce({
              done: true,
              value: {
                type: 'finished',
                value: 'stop',
              },
            }),
        };
      },
    };

    mockGeminiClient.sendMessageStream.mockReturnValue(mockStream);

    // Start a query
    await act(async () => {
      result.current.submitQuery('Test query with tool call');
      // Wait for the tool call to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Verify we have pending tool calls
    expect(result.current.pendingHistoryItems.length).toBeGreaterThan(0);

    // Simulate Escape keypress to cancel
    act(() => {
      capturedUseInputHandler('', { escape: true } as InkKey);
    });

    // Verify tool calls were cancelled
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: expect.arrayContaining([
          expect.objectContaining({
            status: ToolCallStatus.Canceled,
          }),
        ]),
      }),
      expect.any(Number),
    );
  });

  it('should not cancel when Ctrl-C is pressed and not responding', () => {
    const { result } = renderUseGeminiStream();

    // Verify we're in idle state
    expect(result.current.streamingState).toBe(StreamingState.Idle);

    // Simulate Ctrl-C keypress
    act(() => {
      capturedUseInputHandler('c', { ctrl: true } as InkKey);
    });

    // Verify cancelRequest was not called
    expect(onCancelSubmit).not.toHaveBeenCalled();
  });

  it('should handle error during query submission', async () => {
    const { result } = renderUseGeminiStream();

    // Mock an error in sendMessageStream
    mockGeminiClient.sendMessageStream.mockImplementation(() => {
      throw new Error('Test error');
    });

    await act(async () => {
      result.current.submitQuery('Test query');
    });

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Test error'),
      }),
      expect.any(Number),
    );
  });

  it('should handle unauthorized error during query submission', async () => {
    const { result } = renderUseGeminiStream();

    // Mock an unauthorized error
    mockGeminiClient.sendMessageStream.mockImplementation(() => {
      throw new UnauthorizedError('Unauthorized');
    });

    await act(async () => {
      result.current.submitQuery('Test query');
    });

    expect(onAuthError).toHaveBeenCalled();
  });

  it('should schedule and execute tool calls successfully', async () => {
    const { result } = renderUseGeminiStream();

    // Mock a stream that requests a tool call
    const mockStream = {
      [Symbol.asyncIterator]() {
        return {
          next: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: {
                type: 'tool_call_request',
                value: {
                  callId: 'test-call-id',
                  name: 'mockTool',
                  args: { param: 'value' },
                  isClientInitiated: false,
                } as ToolCallRequestInfo,
              },
            })
            .mockResolvedValueOnce({
              done: true,
              value: {
                type: 'finished',
                value: 'stop',
              },
            }),
        };
      },
    };

    mockGeminiClient.sendMessageStream.mockReturnValue(mockStream);

    await act(async () => {
      result.current.submitQuery('Test query with tool call');
      // Wait for the tool call to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Verify tool was executed
    expect(mockTool.execute).toHaveBeenCalledWith(
      { param: 'value' },
      expect.any(AbortSignal),
      undefined,
    );
  });
});
