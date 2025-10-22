/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MutableRefObject } from 'react';
import { render } from 'ink-testing-library';
import { renderHook } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import type { SessionMetrics } from './SessionContext.js';
import { SessionStatsProvider, useSessionStats } from './SessionContext.js';
import { describe, it, expect, vi } from 'vitest';
import { uiTelemetryService } from '@google/gemini-cli-core';

/**
 * A test harness component that uses the hook and exposes the context value
 * via a mutable ref. This allows us to interact with the context's functions
 * and assert against its state directly in our tests.
 */
const TestHarness = ({
  contextRef,
}: {
  contextRef: MutableRefObject<ReturnType<typeof useSessionStats> | undefined>;
}) => {
  contextRef.current = useSessionStats();
  return null;
};

describe('SessionStatsContext', () => {
  it('should provide the correct initial state', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    const stats = contextRef.current?.stats;

    expect(stats?.sessionStartTime).toBeInstanceOf(Date);
    expect(stats?.metrics).toBeDefined();
    expect(stats?.metrics.models).toEqual({});
  });

  it('should update metrics when the uiTelemetryService emits an update', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    const newMetrics: SessionMetrics = {
      models: {
        'gemini-pro': {
          api: {
            totalRequests: 1,
            totalErrors: 0,
            totalLatencyMs: 123,
          },
          tokens: {
            prompt: 100,
            candidates: 200,
            total: 300,
            cached: 50,
            thoughts: 20,
            tool: 10,
          },
        },
      },
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 456,
        totalDecisions: {
          accept: 1,
          reject: 0,
          modify: 0,
          auto_accept: 0,
        },
        byName: {
          'test-tool': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 456,
            decisions: {
              accept: 1,
              reject: 0,
              modify: 0,
              auto_accept: 0,
            },
          },
        },
      },
      files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    };

    act(() => {
      uiTelemetryService.emit('update', {
        metrics: newMetrics,
        lastPromptTokenCount: 100,
      });
    });

    const stats = contextRef.current?.stats;
    expect(stats?.metrics).toEqual(newMetrics);
    expect(stats?.lastPromptTokenCount).toBe(100);
  });

  it('should not update metrics if the data is the same', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    let renderCount = 0;
    const CountingTestHarness = () => {
      contextRef.current = useSessionStats();
      renderCount++;
      return null;
    };

    render(
      <SessionStatsProvider>
        <CountingTestHarness />
      </SessionStatsProvider>,
    );

    expect(renderCount).toBe(1);

    const metrics: SessionMetrics = {
      models: {
        'gemini-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0, auto_accept: 0 },
        byName: {},
      },
      files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    };

    act(() => {
      uiTelemetryService.emit('update', { metrics, lastPromptTokenCount: 10 });
    });

    expect(renderCount).toBe(2);

    act(() => {
      uiTelemetryService.emit('update', { metrics, lastPromptTokenCount: 10 });
    });

    expect(renderCount).toBe(2);

    const newMetrics = {
      ...metrics,
      models: {
        'gemini-pro': {
          api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 200 },
          tokens: {
            prompt: 20,
            candidates: 40,
            total: 60,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        },
      },
    };
    act(() => {
      uiTelemetryService.emit('update', {
        metrics: newMetrics,
        lastPromptTokenCount: 20,
      });
    });

    expect(renderCount).toBe(3);
  });

  it('should throw an error when useSessionStats is used outside of a provider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      // Expect renderHook itself to throw when the hook is used outside a provider
      expect(() => {
        renderHook(() => useSessionStats());
      }).toThrow('useSessionStats must be used within a SessionStatsProvider');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
