/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';
import { ToolCallDecision } from '@google/gemini-cli-core';

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
      sessionId: 'test-session',
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  return render(<SessionSummaryDisplay duration="1h 23m 45s" />);
};

const defaultMetrics: SessionMetrics = {
  models: {
    'gemini-2.5-pro': {
      api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
      tokens: {
        input: 500,
        prompt: 1000,
        candidates: 2000,
        total: 3500,
        cached: 500,
        thoughts: 300,
        tool: 200,
      },
    },
  },
  tools: {
    totalCalls: 0,
    totalSuccess: 0,
    totalFail: 0,
    totalDurationMs: 0,
    totalDecisions: {
      accept: 0,
      reject: 0,
      modify: 0,
      [ToolCallDecision.AUTO_ACCEPT]: 0,
    },
    byName: {},
  },
  files: {
    totalLinesAdded: 42,
    totalLinesRemoved: 15,
  },
};

describe('<SessionSummaryDisplay />', () => {
  it('renders the summary display with a title', () => {
    const { lastFrame } = renderWithMockedStats(defaultMetrics);
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).toMatchSnapshot();
  });

  it('renders resume message when sessionId is provided', () => {
    const originalArgv1 = process.argv[1];
    process.argv[1] = '/path/to/gemini';

    useSessionStatsMock.mockReturnValue({
      stats: {
        sessionId: 'test-session-id',
        sessionStartTime: new Date(),
        metrics: defaultMetrics,
        lastPromptTokenCount: 0,
        promptCount: 5,
      },
      getPromptCount: () => 5,
      startNewPrompt: vi.fn(),
    });

    const { lastFrame } = render(
      <SessionSummaryDisplay duration="1h 0m 0s" sessionId="test-session-id" />,
    );
    const output = lastFrame();

    expect(output).toContain('Resume this session by running');
    expect(output).toContain('gemini --resume');

    process.argv[1] = originalArgv1;
  });
});
