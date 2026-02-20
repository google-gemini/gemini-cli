/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { useAgentHarness } from './useAgentHarness.js';
import {
  GeminiEventType as ServerGeminiEventType,
  ROOT_SCHEDULER_ID,
} from '@google/gemini-cli-core';
import { makeFakeConfig } from '../../../../core/src/test-utils/config.js';
import type {
  Config,
  ServerGeminiStreamEvent as GeminiEvent,
} from '@google/gemini-cli-core';
import { StreamingState, MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    AgentFactory: {
      createHarness: vi.fn(),
    },
  };
});

describe('useAgentHarness', () => {
  let mockAddItem: Mock;
  let mockConfig: Config;
  let mockOnCancelSubmit: Mock;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockConfig = makeFakeConfig();
    mockOnCancelSubmit = vi.fn();

    vi.spyOn(mockConfig, 'getToolRegistry').mockReturnValue({
      getTool: vi.fn().mockReturnValue({
        displayName: 'codebase_investigator',
        createInvocation: vi.fn().mockReturnValue({
          getDescription: () => 'Test Tool Description',
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(mockConfig, 'getMessageBus').mockReturnValue({
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      unsubscribe: vi.fn(),
      publish: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.clearAllMocks();
  });

  it('initializes in Idle state', () => {
    const { result } = renderHookWithProviders(() =>
      useAgentHarness(mockAddItem, mockConfig, mockOnCancelSubmit),
    );

    expect(result.current.streamingState).toBe(StreamingState.Idle);
    expect(result.current.isResponding).toBe(false);
  });

  it('updates state live during processEvent', async () => {
    const { result } = renderHookWithProviders(() =>
      useAgentHarness(mockAddItem, mockConfig, mockOnCancelSubmit),
    );

    // 1. Send content
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.Content,
        value: 'Hello',
      } as GeminiEvent);
    });
    expect(result.current.streamingContent).toBe('Hello');
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 2. Send thought
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.Thought,
        value: { subject: 'Thinking' },
      } as GeminiEvent);
    });
    expect(result.current.thought?.subject).toBe('Thinking');

    // 3. Send tool request
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.ToolCallRequest,
        value: {
          name: 'tool_1',
          callId: 'c1',
          args: {},
          schedulerId: ROOT_SCHEDULER_ID,
        },
      } as GeminiEvent);
    });
    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.toolCalls[0].request.name).toBe('tool_1');
  });

  it('merges subagent activity into active tool calls', async () => {
    const { result } = renderHookWithProviders(() =>
      useAgentHarness(mockAddItem, mockConfig, mockOnCancelSubmit),
    );

    // Start a delegation tool
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.ToolCallRequest,
        value: {
          name: 'subagent_tool',
          callId: 'c1',
          args: {},
          schedulerId: ROOT_SCHEDULER_ID,
        },
      } as GeminiEvent);
    });

    // Send subagent activity
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.SubagentActivity,
        value: {
          agentName: 'codebase_investigator',
          type: 'THOUGHT',
          data: { subject: 'Analyzing logs' },
        },
      } as GeminiEvent);
    });

    // Verify the tool box resultDisplay was updated with the thought
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result.current.toolCalls[0] as any).response?.resultDisplay,
    ).toContain('🤖💭 Analyzing logs');

    // Send another activity
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.SubagentActivity,
        value: {
          agentName: 'codebase_investigator',
          type: 'TOOL_CALL_START',
          data: { name: 'list_directory' },
        },
      } as GeminiEvent);
    });

    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result.current.toolCalls[0] as any).response?.resultDisplay,
    ).toContain('🛠️ Calling codebase_investigator...');
  });

  it('flushes to history on TurnFinished', async () => {
    const { result } = renderHookWithProviders(() =>
      useAgentHarness(mockAddItem, mockConfig, mockOnCancelSubmit),
    );

    // Setup some state
    await act(async () => {
      result.current.processEvent({
        type: ServerGeminiEventType.Content,
        value: 'Done',
      } as GeminiEvent);
      result.current.processEvent({
        type: ServerGeminiEventType.TurnFinished,
      } as GeminiEvent);
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.GEMINI,
        text: 'Done',
      }),
    );
    expect(result.current.streamingContent).toBe(''); // Should be cleared
  });
});
