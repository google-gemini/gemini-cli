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

import { useAgentStream } from './useAgentStream.js';
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
});
