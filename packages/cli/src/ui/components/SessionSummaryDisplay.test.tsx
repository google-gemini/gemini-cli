/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (metrics: SessionMetrics) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
    },
  });

  return render(<SessionSummaryDisplay duration="1h 23m 45s" />);
};

describe('<SessionSummaryDisplay />', () => {
  it('correctly sums and displays stats from multiple models', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
          tokens: {
            prompt: 1000,
            candidates: 2000,
            total: 3500,
            cached: 500,
            thoughts: 300,
            tool: 200,
          },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 5, totalErrors: 0, totalLatencyMs: 12345 },
          tokens: {
            prompt: 500,
            candidates: 1000,
            total: 1500,
            cached: 100,
            thoughts: 50,
            tool: 20,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    // Verify totals are summed correctly
    expect(output).toContain('Cumulative Stats (15 API calls)');
    expect(output).toMatchSnapshot();
  });

  it('renders zero state correctly', () => {
    const zeroMetrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const { lastFrame } = renderWithMockedStats(zeroMetrics);
    expect(lastFrame()).toMatchSnapshot();
  });
});
