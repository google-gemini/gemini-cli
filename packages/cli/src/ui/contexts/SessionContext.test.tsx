/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MutableRefObject, Component, type ReactNode } from 'react';
import { render } from '../../test-utils/render.js';

import { act } from 'react';
import type { SessionMetrics } from './SessionContext.js';
import { SessionStatsProvider, useSessionStats } from './SessionContext.js';
import { describe, it, expect, vi } from 'vitest';
import { uiTelemetryService } from '@google/gemini-cli-core';

class ErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  override render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

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

    const { unmount } = render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    const stats = contextRef.current?.stats;

    expect(stats?.sessionStartTime).toBeInstanceOf(Date);
    expect(stats?.metrics).toBeDefined();
    expect(stats?.metrics.models).toEqual({});
    unmount();
  });

  it('should update metrics when the uiTelemetryService emits an update', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    const { unmount } = render(
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
            input: 50,
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
    unmount();
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

    const { unmount } = render(
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
            input: 10,
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
            input: 20,
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
    unmount();
  });

  it('should throw an error when useSessionStats is used outside of a provider', () => {
    const onError = vi.fn();
    // Suppress console.error from React for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(
      <ErrorBoundary onError={onError}>
        <TestHarness contextRef={{ current: undefined }} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'useSessionStats must be used within a SessionStatsProvider',
      }),
    );

    consoleSpy.mockRestore();
    unmount();
  });
});
