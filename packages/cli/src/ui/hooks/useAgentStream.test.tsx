/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import type { LegacyAgentProtocol } from '@google/gemini-cli-core';
import {
  ApprovalMode,
  CoreToolCallStatus,
  MessageBusType,
  ToolConfirmationOutcome,
  type ToolCall,
  type ToolCallsUpdateMessage,
} from '@google/gemini-cli-core';
import { renderHookWithProviders } from '../../test-utils/render.js';

const mockLegacyAgentProtocol = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ streamId: 'test-stream-id' }),
  subscribe: vi.fn().mockReturnValue(() => {}),
  abort: vi.fn().mockResolvedValue(undefined),
}));

const mockUseExecutionLifecycle = vi.hoisted(() =>
  vi.fn(() => ({
    activeShellPtyId: null,
    lastShellOutputTime: 0,
    backgroundTaskCount: 0,
    isBackgroundTaskVisible: false,
    toggleBackgroundTasks: vi.fn(),
    backgroundCurrentExecution: vi.fn(),
    dismissBackgroundTask: vi.fn(),
    backgroundTasks: new Map(),
  })),
);

vi.mock('./useExecutionLifecycle.js', () => ({
  useExecutionLifecycle: mockUseExecutionLifecycle,
}));

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSessionStats: vi.fn(() => ({
      startNewPrompt: vi.fn(),
    })),
  };
});

import { useAgentStream } from './useAgentStream.js';
import { MessageType, StreamingState } from '../types.js';

describe('useAgentStream', () => {
  const mockAddItem = vi.fn();
  const mockOnCancelSubmit = vi.fn();
  const mockOnDebugMessage = vi.fn();
  const mockSetShellInputFocused = vi.fn();
  const mockPublish = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn();
  const mockUnsubscribe = vi.fn();
  const mockAddHistory = vi.fn().mockResolvedValue(undefined);
  const mockDisableForSession = vi.fn();
  const mockConfig = {
    getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
    getMessageBus: vi.fn(() => ({
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      publish: mockPublish,
    })),
    getGeminiClient: vi.fn(() => ({
      addHistory: mockAddHistory,
      getLoopDetectionService: () => ({
        disableForSession: mockDisableForSession,
      }),
    })),
  };

  let toolCallsUpdateHandler:
    | ((message: ToolCallsUpdateMessage) => void)
    | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    toolCallsUpdateHandler = undefined;
    mockSubscribe.mockImplementation((type, listener) => {
      if (type === MessageBusType.TOOL_CALLS_UPDATE) {
        toolCallsUpdateHandler = listener as (
          message: ToolCallsUpdateMessage,
        ) => void;
      }
    });
    mockUseExecutionLifecycle.mockReturnValue({
      activeShellPtyId: null,
      lastShellOutputTime: 0,
      backgroundTaskCount: 0,
      isBackgroundTaskVisible: false,
      toggleBackgroundTasks: vi.fn(),
      backgroundCurrentExecution: vi.fn(),
      dismissBackgroundTask: vi.fn(),
      backgroundTasks: new Map(),
    });
  });

  const renderHook = async () =>
    renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        config: mockConfig as never,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        onDebugMessage: mockOnDebugMessage,
        setShellInputFocused: mockSetShellInputFocused,
        terminalWidth: 120,
        terminalHeight: 40,
        isShellFocused: false,
      }),
    );

  const getEventHandler = () =>
    vi.mocked(mockLegacyAgentProtocol.subscribe).mock.calls[0][0];

  const emitToolCallsUpdate = (toolCalls: ToolCall[], schedulerId = 'root') => {
    if (!toolCallsUpdateHandler) {
      throw new Error('Tool calls update handler was not registered');
    }
    act(() => {
      toolCallsUpdateHandler?.({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        schedulerId,
        toolCalls,
      });
    });
  };

  const createAwaitingApprovalToolCall = (
    name: string,
    callId: string,
    correlationId = `corr-${callId}`,
  ) =>
    ({
      status: CoreToolCallStatus.AwaitingApproval,
      request: {
        callId,
        name,
        args: { path: '/tmp/file.txt' },
        isClientInitiated: false,
        prompt_id: 'prompt-id',
      },
      tool: {
        displayName: name,
        isOutputMarkdown: false,
      },
      invocation: {
        getDescription: () => `${name} description`,
      },
      confirmationDetails: {
        type: 'edit',
        title: 'Edit',
        fileName: 'file.txt',
        filePath: '/tmp/file.txt',
        fileDiff: '@@',
        originalContent: 'old',
        newContent: 'new',
      },
      correlationId,
    }) as ToolCall;

  const createExecutingToolCall = (pid: number) =>
    ({
      status: CoreToolCallStatus.Executing,
      request: {
        callId: 'exec-call',
        name: 'run_shell_command',
        args: { command: 'sleep 1' },
        isClientInitiated: false,
        prompt_id: 'prompt-id',
      },
      tool: {
        displayName: 'run_shell_command',
        isOutputMarkdown: false,
      },
      invocation: {
        getDescription: () => 'sleep 1',
      },
      pid,
    }) as ToolCall;

  it('should initialize on mount', async () => {
    await renderHook();

    expect(mockLegacyAgentProtocol.subscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalledWith(
      MessageBusType.TOOL_CALLS_UPDATE,
      expect.any(Function),
    );
  });

  it('should call agent.send when submitQuery is called', async () => {
    const { result } = await renderHook();

    await act(async () => {
      await result.current.submitQuery('hello');
    });

    expect(mockLegacyAgentProtocol.send).toHaveBeenCalledWith({
      message: { content: [{ type: 'text', text: 'hello' }] },
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.USER, text: 'hello' }),
      expect.any(Number),
    );
  });

  it('should update streamingState based on agent_start and agent_end events', async () => {
    const { result } = await renderHook();
    const eventHandler = getEventHandler();

    expect(result.current.streamingState).toBe(StreamingState.Idle);

    act(() => {
      eventHandler({
        type: 'agent_start',
        id: '1',
        timestamp: '',
        streamId: '',
      });
    });
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    act(() => {
      eventHandler({
        type: 'agent_end',
        reason: 'completed',
        id: '2',
        timestamp: '',
        streamId: '',
      });
    });
    expect(result.current.streamingState).toBe(StreamingState.Idle);
  });

  it('should accumulate text content and update pendingHistoryItems', async () => {
    const { result } = await renderHook();
    const eventHandler = getEventHandler();

    act(() => {
      eventHandler({
        type: 'message',
        role: 'agent',
        content: [{ type: 'text', text: 'Hello' }],
        id: '1',
        timestamp: '',
        streamId: '',
      });
    });

    expect(result.current.pendingHistoryItems).toHaveLength(1);
    expect(result.current.pendingHistoryItems[0]).toMatchObject({
      type: 'gemini',
      text: 'Hello',
    });

    act(() => {
      eventHandler({
        type: 'message',
        role: 'agent',
        content: [{ type: 'text', text: ' world' }],
        id: '2',
        timestamp: '',
        streamId: '',
      });
    });

    expect(result.current.pendingHistoryItems[0].text).toBe('Hello world');
  });

  it('should process thought events and update thought state', async () => {
    const { result } = await renderHook();
    const eventHandler = getEventHandler();

    act(() => {
      eventHandler({
        type: 'message',
        role: 'agent',
        content: [{ type: 'thought', thought: '**Thinking** about tests' }],
        id: '1',
        timestamp: '',
        streamId: '',
      });
    });

    expect(result.current.thought).toEqual({
      subject: 'Thinking',
      description: 'about tests',
    });
  });

  it('should call agent.abort when cancelOngoingRequest is called', async () => {
    const { result } = await renderHook();

    await act(async () => {
      await result.current.cancelOngoingRequest();
    });

    expect(mockLegacyAgentProtocol.abort).toHaveBeenCalled();
    expect(mockOnCancelSubmit).toHaveBeenCalledWith(false, true);
  });

  it('should expose activePtyId from executing tool call updates', async () => {
    const { result } = await renderHook();

    emitToolCallsUpdate([createExecutingToolCall(4242)]);

    expect(result.current.activePtyId).toBe(4242);
    expect(result.current.streamingState).toBe(StreamingState.Responding);
  });

  it('should set loopDetectionConfirmationRequest and retry when disabling loop detection', async () => {
    const { result } = await renderHook();
    const eventHandler = getEventHandler();

    await act(async () => {
      await result.current.submitQuery('test query');
    });

    act(() => {
      eventHandler({
        type: 'error',
        status: 'INTERNAL',
        message: 'Loop detected, stopping execution',
        fatal: false,
        id: 'loop-1',
        timestamp: '',
        streamId: 'stream-1',
        _meta: { code: 'LOOP_DETECTED' },
      });
    });

    expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();

    await act(async () => {
      await result.current.loopDetectionConfirmationRequest?.onComplete({
        userSelection: 'disable',
      });
    });

    expect(mockDisableForSession).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: 'Loop detection has been disabled for this session. Retrying request...',
    });
    expect(mockLegacyAgentProtocol.send).toHaveBeenCalledTimes(2);
    expect(result.current.loopDetectionConfirmationRequest).toBeNull();
  });

  it('should auto-approve awaiting tool calls when switching to YOLO mode', async () => {
    const { result } = await renderHook();

    emitToolCallsUpdate([
      createAwaitingApprovalToolCall('replace', 'call1'),
      createAwaitingApprovalToolCall('read_file', 'call2'),
    ]);

    await act(async () => {
      await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
    });

    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-call1',
        outcome: ToolConfirmationOutcome.ProceedOnce,
      }),
    );
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-call2',
      }),
    );
  });

  it('should inject a notification message when manually exiting Plan Mode', async () => {
    mockConfig.getApprovalMode.mockReturnValueOnce(ApprovalMode.PLAN);
    const { result } = await renderHook();

    await act(async () => {
      await result.current.handleApprovalModeChange(ApprovalMode.DEFAULT);
    });

    expect(mockAddHistory).toHaveBeenCalledWith({
      role: 'user',
      parts: [
        {
          text: expect.stringContaining('Plan Mode'),
        },
      ],
    });
  });
});
