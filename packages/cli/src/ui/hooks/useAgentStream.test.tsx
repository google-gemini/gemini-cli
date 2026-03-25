/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import {
  type Config,
  type GeminiClient,
  LegacyAgentSession as MockLegacyAgentSession,
} from '@google/gemini-cli-core';
import { type LoadedSettings } from '../../config/settings.js';
import { renderHookWithProviders } from '../../test-utils/render.js';

// --- MOCKS ---

const mockScheduler = vi.hoisted(() => ({
  schedule: vi.fn(),
  dispose: vi.fn(),
  cancelAll: vi.fn(),
}));

const mockLegacyAgentSession = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ streamId: 'test-stream-id' }),
  subscribe: vi.fn().mockReturnValue(() => {}),
  abort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./useToolScheduler.js', () => ({
  useToolScheduler: vi.fn().mockReturnValue([
    [], // toolCalls
    vi.fn(), // schedule
    vi.fn(), // markToolsAsSubmitted
    vi.fn(), // setToolCallsForDisplay
    vi.fn(), // cancelAll
    0, // lastToolOutputTime
    mockScheduler, // scheduler
  ]),
}));

vi.mock('./useLogger.js', () => ({
  useLogger: vi.fn().mockReturnValue({
    logMessage: vi.fn().mockResolvedValue(undefined),
  }),
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

// Mock core classes properly
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    LegacyAgentSession: vi
      .fn()
      .mockImplementation(() => mockLegacyAgentSession),
  };
});

// --- END MOCKS ---

import { useAgentStream } from './useAgentStream.js';
import { MessageType, StreamingState } from '../types.js';

describe('useAgentStream', () => {
  const mockAddItem = vi.fn();
  const mockOnDebugMessage = vi.fn();
  const mockHandleSlashCommand = vi.fn().mockResolvedValue(false);
  const mockOnAuthError = vi.fn();
  const mockPerformMemoryRefresh = vi.fn(() => Promise.resolve());
  const mockSetModelSwitchedFromQuotaError = vi.fn();
  const mockOnCancelSubmit = vi.fn();
  const mockSetShellInputFocused = vi.fn();

  const mockConfig = {
    storage: {},
    getSessionId: () => 'test-session',
    getExperimentalUseAgentProtocol: () => true,
    getApprovalMode: () => 'default',
    getMessageBus: () => ({}),
  } as Config;

  const mockSettings = {
    merged: {
      billing: { overageStrategy: 'stop' },
      ui: { errorVerbosity: 'full' },
    },
  } as unknown as LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize LegacyAgentSession on mount', async () => {
    await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    expect(MockLegacyAgentSession).toHaveBeenCalled();
    expect(mockLegacyAgentSession.subscribe).toHaveBeenCalled();
  });

  it('should call session.send when submitQuery is called', async () => {
    const { result } = await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    await act(async () => {
      await result.current.submitQuery('hello');
    });

    expect(mockLegacyAgentSession.send).toHaveBeenCalledWith({
      message: [{ type: 'text', text: 'hello' }],
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.USER, text: 'hello' }),
      expect.any(Number),
    );
  });

  it('should update streamingState based on agent_start and agent_end events', async () => {
    const { result } = await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    const eventHandler = vi.mocked(mockLegacyAgentSession.subscribe).mock
      .calls[0][0];

    expect(result.current.streamingState).toBe(StreamingState.Idle);

    act(() => {
      eventHandler({ type: 'agent_start' });
    });
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    act(() => {
      eventHandler({ type: 'agent_end', reason: 'completed' });
    });
    expect(result.current.streamingState).toBe(StreamingState.Idle);
  });

  it('should accumulate text content and update pendingHistoryItems', async () => {
    const { result } = await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    const eventHandler = vi.mocked(mockLegacyAgentSession.subscribe).mock
      .calls[0][0];

    act(() => {
      eventHandler({
        type: 'message',
        role: 'agent',
        content: [{ type: 'text', text: 'Hello' }],
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
      });
    });

    expect(result.current.pendingHistoryItems[0].text).toBe('Hello world');
  });

  it('should process thought events and update thought state', async () => {
    const { result } = await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    const eventHandler = vi.mocked(mockLegacyAgentSession.subscribe).mock
      .calls[0][0];

    act(() => {
      eventHandler({
        type: 'message',
        role: 'agent',
        content: [{ type: 'thought', thought: '**Thinking** about tests' }],
      });
    });

    expect(result.current.thought).toEqual({
      subject: 'Thinking',
      description: 'about tests',
    });
  });

  it('should display error message when a tool call requires approval', async () => {
    let eventHandler: (event: unknown) => void = () => {};
    vi.spyOn(mockLegacyAgentSession, 'subscribe').mockImplementation(
      (handler) => {
        eventHandler = handler;
        return () => {};
      },
    );

    await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    act(() => {
      eventHandler({
        type: 'error',
        status: 'UNIMPLEMENTED',
        message:
          'TODO: Tool approvals not yet implemented, please switch to YOLO mode to test.',
        fatal: true,
      });
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'TODO: Tool approvals not yet implemented, please switch to YOLO mode to test.',
      }),
      expect.any(Number),
    );
  });

  it('should call session.abort when cancelOngoingRequest is called', async () => {
    const { result } = await renderHookWithProviders(() =>
      useAgentStream(
        {} as GeminiClient,
        [],
        mockAddItem,
        mockConfig,
        mockSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => undefined,
        mockOnAuthError,
        mockPerformMemoryRefresh,
        false,
        mockSetModelSwitchedFromQuotaError,
        mockOnCancelSubmit,
        mockSetShellInputFocused,
        80,
        24,
      ),
    );

    await act(async () => {
      await result.current.cancelOngoingRequest();
    });

    expect(mockLegacyAgentSession.abort).toHaveBeenCalled();
    expect(mockOnCancelSubmit).toHaveBeenCalledWith(false);
  });
});
