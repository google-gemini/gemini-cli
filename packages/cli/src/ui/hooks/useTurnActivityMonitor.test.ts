/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useTurnActivityMonitor } from './useTurnActivityMonitor.js';
import { StreamingState } from '../types.js';
import { hasRedirection } from '@google/gemini-cli-core';
import { type TrackedToolCall } from './useReactToolScheduler.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    hasRedirection: vi.fn(),
  };
});

describe('useTurnActivityMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(hasRedirection).mockImplementation(
      (query: string) => query.includes('>') || query.includes('>>'),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should set operationStartTime when entering Responding state', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useTurnActivityMonitor(state, null, []),
      {
        initialProps: { state: StreamingState.Idle },
      },
    );

    expect(result.current.operationStartTime).toBe(0);

    rerender({ state: StreamingState.Responding });
    expect(result.current.operationStartTime).toBe(1000);
  });

  it('should reset operationStartTime when PTY ID changes while responding', () => {
    const { result, rerender } = renderHook(
      ({ state, ptyId }) => useTurnActivityMonitor(state, ptyId, []),
      {
        initialProps: {
          state: StreamingState.Responding,
          ptyId: 'pty-1' as string | null,
        },
      },
    );

    expect(result.current.operationStartTime).toBe(1000);

    vi.setSystemTime(2000);
    rerender({ state: StreamingState.Responding, ptyId: 'pty-2' });
    expect(result.current.operationStartTime).toBe(2000);
  });

  it('should detect redirection from tool calls', () => {
    // Force mock implementation to ensure it's active
    vi.mocked(hasRedirection).mockImplementation((q: string) =>
      q.includes('>'),
    );

    const { result, rerender } = renderHook(
      ({ state, pendingToolCalls }) =>
        useTurnActivityMonitor(state, null, pendingToolCalls),
      {
        initialProps: {
          state: StreamingState.Responding,
          pendingToolCalls: [] as TrackedToolCall[],
        },
      },
    );

    expect(result.current.isRedirectionActive).toBe(false);

    // Test non-redirected tool call
    rerender({
      state: StreamingState.Responding,
      pendingToolCalls: [
        {
          request: {
            name: 'run_shell_command',
            args: { command: 'ls -la' },
          },
          status: 'executing',
        } as unknown as TrackedToolCall,
      ],
    });
    expect(result.current.isRedirectionActive).toBe(false);

    // Test tool call redirection
    rerender({
      state: StreamingState.Responding,
      pendingToolCalls: [
        {
          request: {
            name: 'run_shell_command',
            args: { command: 'ls > tool_out.txt' },
          },
          status: 'executing',
        } as unknown as TrackedToolCall,
      ],
    });
    expect(result.current.isRedirectionActive).toBe(true);
  });

  it('should reset everything when idle', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useTurnActivityMonitor(state, 'pty-1', []),
      {
        initialProps: { state: StreamingState.Responding },
      },
    );

    expect(result.current.operationStartTime).toBe(1000);

    rerender({ state: StreamingState.Idle });
    expect(result.current.operationStartTime).toBe(0);
  });
});
