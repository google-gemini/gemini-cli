/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import type { LegacyAgentProtocol } from '@google/gemini-cli-core';
import { renderHookWithProviders } from '../../test-utils/render.js';

// --- MOCKS ---

const mockLegacyAgentProtocol = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ streamId: 'test-stream-id' }),
  subscribe: vi.fn().mockReturnValue(() => {}),
  abort: vi.fn().mockResolvedValue(undefined),
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

// --- END MOCKS ---

import { createCancelledToolCall, useAgentStream } from './useAgentStream.js';
import { MessageType, StreamingState } from '../types.js';

describe('useAgentStream', () => {
  const mockAddItem = vi.fn();
  const mockOnCancelSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize on mount', async () => {
    await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

    expect(mockLegacyAgentProtocol.subscribe).toHaveBeenCalled();
  });

  it('should call agent.send when submitQuery is called', async () => {
    const { result } = await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

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
    const { result } = await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

    const eventHandler = vi.mocked(mockLegacyAgentProtocol.subscribe).mock
      .calls[0][0];

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
    const { result } = await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

    const eventHandler = vi.mocked(mockLegacyAgentProtocol.subscribe).mock
      .calls[0][0];

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
    const { result } = await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

    const eventHandler = vi.mocked(mockLegacyAgentProtocol.subscribe).mock
      .calls[0][0];

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
    const { result } = await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

    await act(async () => {
      await result.current.cancelOngoingRequest();
    });

    expect(mockLegacyAgentProtocol.abort).toHaveBeenCalled();
    expect(mockOnCancelSubmit).toHaveBeenCalledWith(false, true);
  });

  it('should synthesize and record filler functionResponse via recordCompletedToolCalls on cancelOngoingRequest', async () => {
    const mockRecordCompletedToolCalls = vi.fn();
    const mockConfig = {
      getModel: vi.fn(() => 'gemini-2.5-pro'),
      getGeminiClient: vi.fn(() => ({
        getCurrentSequenceModel: vi.fn(() => 'gemini-2.5-pro'),
        getHistory: vi.fn(() => []),
        getChat: vi.fn(() => ({
          recordCompletedToolCalls: mockRecordCompletedToolCalls,
        })),
      })),
    };

    const { result } = await renderHookWithProviders(() =>
      useAgentStream({
        agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
        config:
          mockConfig as unknown as import('@google/gemini-cli-core').Config,
        addItem: mockAddItem,
        onCancelSubmit: mockOnCancelSubmit,
        isShellFocused: false,
      }),
    );

    const eventHandler = vi.mocked(mockLegacyAgentProtocol.subscribe).mock
      .calls[0][0];

    act(() => {
      eventHandler({
        type: 'tool_request',
        requestId: 'call-123',
        name: 'run_shell_command',
        args: { command: 'sleep 10' },
        id: '1',
        timestamp: '',
        streamId: '',
      });
    });

    await act(async () => {
      await result.current.cancelOngoingRequest();
    });

    expect(mockRecordCompletedToolCalls).toHaveBeenCalledTimes(1);
    expect(mockRecordCompletedToolCalls).toHaveBeenCalledWith(
      'gemini-2.5-pro',
      [
        expect.objectContaining({
          status: 'cancelled',
          request: expect.objectContaining({
            callId: 'call-123',
            name: 'run_shell_command',
            args: { command: 'sleep 10' },
          }),
          response: expect.objectContaining({
            callId: 'call-123',
            responseParts: [
              {
                functionResponse: {
                  id: 'call-123',
                  name: 'run_shell_command',
                  response: {
                    error:
                      '[Operation Cancelled] Reason: User cancelled operation',
                  },
                },
              },
            ],
          }),
        }),
      ],
    );
  });

  it('should bound hanging agent.abort() with a 1s timeout in cancelOngoingRequest', async () => {
    vi.useFakeTimers();
    try {
      mockLegacyAgentProtocol.abort.mockImplementationOnce(
        () => new Promise(() => {}),
      );

      const { result } = await renderHookWithProviders(() =>
        useAgentStream({
          agent: mockLegacyAgentProtocol as unknown as LegacyAgentProtocol,
          addItem: mockAddItem,
          onCancelSubmit: mockOnCancelSubmit,
          isShellFocused: false,
        }),
      );

      let resolved = false;
      let cancelPromise!: Promise<void>;
      act(() => {
        cancelPromise = result.current.cancelOngoingRequest().then(() => {
          resolved = true;
        });
      });

      expect(resolved).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await cancelPromise;
      });

      expect(resolved).toBe(true);
      expect(mockOnCancelSubmit).toHaveBeenCalledWith(false, true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should provide safe fallback tool and invocation objects in createCancelledToolCall', () => {
    const cancelledWithEmptyName = createCancelledToolCall({
      callId: 'call-empty',
      name: '   ',
      args: {},
      isClientInitiated: false,
      prompt_id: '',
    });

    expect(cancelledWithEmptyName.tool?.name).toBe('generic_tool');
    expect(cancelledWithEmptyName.tool?.displayName).toBe('generic_tool');
    expect(
      'invocation' in cancelledWithEmptyName &&
        cancelledWithEmptyName.invocation.getDescription(),
    ).toBe('generic_tool');
  });
});
