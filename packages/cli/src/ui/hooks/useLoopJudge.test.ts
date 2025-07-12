/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLoopJudge } from './useLoopJudge.js';
import { HistoryItem, StreamingState, ToolCall, ToolGroup } from '../types.js';
import crypto from 'crypto';

// Mock the crypto module
vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('mocked_hash'),
  },
}));

const LOOP_THRESHOLD = 5;

const createMockToolCall = (
  name: string,
  description: string,
  resultDisplay: object,
): ToolCall => ({
  name,
  description,
  resultDisplay,
  args: {},
  result: '',
});

const createMockToolGroup = (tools: ToolCall[]): ToolGroup => ({
  type: 'tool_group',
  id: `tool_group_${Math.random()}`,
  tools,
});

describe('useLoopJudge', () => {
  let cancelRequest: (reason: string) => void;

  beforeEach(() => {
    cancelRequest = vi.fn();
    // Reset mocks before each test
    vi.spyOn(crypto, 'createHash').mockImplementation(
      () =>
        ({
          update: vi.fn().mockReturnThis(),
          digest: vi.fn().mockImplementation(function (this: {
            update: vi.Mock;
          }) {
            // Create a hash from the mocked update call
            const input = this.update.mock.calls[0][0];
            return `hash_for_${input}`;
          }),
        }) as unknown as crypto.Hash,
    );
  });

  it('should not call cancelRequest when streamingState is Idle', () => {
    const history: HistoryItem[] = [];
    renderHook(() => useLoopJudge(history, StreamingState.Idle, cancelRequest));
    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should not call cancelRequest when streamingState is Input', () => {
    const history: HistoryItem[] = [];
    renderHook(() =>
      useLoopJudge(history, StreamingState.Input, cancelRequest),
    );
    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should not call cancelRequest if history does not grow', () => {
    const toolCall = createMockToolCall('test-tool', 'desc', { data: 1 });
    const history: HistoryItem[] = [createMockToolGroup([toolCall])];

    const { rerender } = renderHook(
      ({ history, streamingState }) =>
        useLoopJudge(history, streamingState, cancelRequest),
      {
        initialProps: {
          history: [],
          streamingState: StreamingState.Responding,
        },
      },
    );

    rerender({ history, streamingState: StreamingState.Responding });
    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should not call cancelRequest if the last history item is not a tool_group', () => {
    const history: HistoryItem[] = [{ type: 'user', parts: [] }];
    renderHook(() =>
      useLoopJudge(history, StreamingState.Responding, cancelRequest),
    );
    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should call cancelRequest when the same tool call is repeated LOOP_THRESHOLD times', () => {
    const toolCall = createMockToolCall('test-tool', 'desc', { data: 'a' });
    let history: HistoryItem[] = [];

    const { rerender } = renderHook(
      ({ history, streamingState }) =>
        useLoopJudge(history, streamingState, cancelRequest),
      {
        initialProps: {
          history,
          streamingState: StreamingState.Responding,
        },
      },
    );

    for (let i = 0; i < LOOP_THRESHOLD; i++) {
      history = [...history, createMockToolGroup([toolCall])];
      rerender({ history, streamingState: StreamingState.Responding });
    }

    expect(cancelRequest).toHaveBeenCalledOnce();
    expect(cancelRequest).toHaveBeenCalledWith(
      'A potential loop was detected due to repetitive tool calls. The request has been cancelled. Please try again with a more specific prompt.',
    );
  });

  it('should not call cancelRequest if the same tool call is repeated less than LOOP_THRESHOLD times', () => {
    const toolCall = createMockToolCall('test-tool', 'desc', { data: 'a' });
    let history: HistoryItem[] = [];

    const { rerender } = renderHook(
      ({ history, streamingState }) =>
        useLoopJudge(history, streamingState, cancelRequest),
      {
        initialProps: {
          history,
          streamingState: StreamingState.Responding,
        },
      },
    );

    for (let i = 0; i < LOOP_THRESHOLD - 1; i++) {
      history = [...history, createMockToolGroup([toolCall])];
      rerender({ history, streamingState: StreamingState.Responding });
    }

    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should not call cancelRequest for different tool calls', () => {
    let history: HistoryItem[] = [];
    const { rerender } = renderHook(
      ({ history, streamingState }) =>
        useLoopJudge(history, streamingState, cancelRequest),
      {
        initialProps: {
          history,
          streamingState: StreamingState.Responding,
        },
      },
    );

    for (let i = 0; i < LOOP_THRESHOLD; i++) {
      const toolCall = createMockToolCall(`tool-${i}`, 'desc', { data: i });
      history = [...history, createMockToolGroup([toolCall])];
      rerender({ history, streamingState: StreamingState.Responding });
    }

    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should not call cancelRequest for tool calls with different results', () => {
    let history: HistoryItem[] = [];
    const { rerender } = renderHook(
      ({ history, streamingState }) =>
        useLoopJudge(history, streamingState, cancelRequest),
      {
        initialProps: {
          history,
          streamingState: StreamingState.Responding,
        },
      },
    );

    for (let i = 0; i < LOOP_THRESHOLD; i++) {
      const toolCall = createMockToolCall('test-tool', 'desc', { data: i });
      history = [...history, createMockToolGroup([toolCall])];
      rerender({ history, streamingState: StreamingState.Responding });
    }

    expect(cancelRequest).not.toHaveBeenCalled();
  });

  it('should reset counts when streamingState becomes Idle', () => {
    const toolCall = createMockToolCall('test-tool', 'desc', { data: 'a' });
    let history: HistoryItem[] = [];

    const { rerender } = renderHook(
      ({ history, streamingState }) =>
        useLoopJudge(history, streamingState, cancelRequest),
      {
        initialProps: {
          history,
          streamingState: StreamingState.Responding,
        },
      },
    );

    // Repeat just under the threshold
    for (let i = 0; i < LOOP_THRESHOLD - 1; i++) {
      history = [...history, createMockToolGroup([toolCall])];
      rerender({ history, streamingState: StreamingState.Responding });
    }
    expect(cancelRequest).not.toHaveBeenCalled();

    // Reset by going to Idle
    rerender({ history, streamingState: StreamingState.Idle });

    // Repeat again, should not trigger cancel
    for (let i = 0; i < LOOP_THRESHOLD - 1; i++) {
      history = [...history, createMockToolGroup([toolCall])];
      rerender({ history, streamingState: StreamingState.Responding });
    }
    expect(cancelRequest).not.toHaveBeenCalled();

    // One more time should now trigger it
    history = [...history, createMockToolGroup([toolCall])];
    rerender({ history, streamingState: StreamingState.Responding });
    expect(cancelRequest).toHaveBeenCalledOnce();
  });

  it('should correctly hash the tool call signature', () => {
    const toolCall = createMockToolCall('test-tool', 'desc', { data: 1 });
    const history = [createMockToolGroup([toolCall])];
    const update = vi.fn().mockReturnThis();
    const digest = vi.fn().mockReturnValue('correct_hash');
    const createHash = vi.fn(() => ({
      update,
      digest,
    }));
    vi.spyOn(crypto, 'createHash').mockImplementation(createHash);

    renderHook(() =>
      useLoopJudge(history, StreamingState.Responding, cancelRequest),
    );

    expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    const expectedSignature = 'test-tool-desc-{"data":1}';
    expect(update).toHaveBeenCalledWith(expectedSignature);
    expect(digest).toHaveBeenCalledWith('hex');
  });
});
