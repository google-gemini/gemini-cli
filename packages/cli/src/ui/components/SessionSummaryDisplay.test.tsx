/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
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

const renderWithMockedStats = async (
  metrics: SessionMetrics,
  sessionId = 'test-session',
) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId,
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  const result = renderWithProviders(
    <SessionSummaryDisplay duration="1h 23m 45s" />,
    {
      width: 100,
    },
  );
  await result.waitUntilReady();
  return result;
};

describe('<SessionSummaryDisplay />', () => {
  const emptyMetrics: SessionMetrics = {
    models: {},
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
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  };

  it('renders the summary display with a title', async () => {
    const metrics: SessionMetrics = {
      ...emptyMetrics,
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
          roles: {},
        },
      },
      files: {
        totalLinesAdded: 42,
        totalLinesRemoved: 15,
      },
    };

    const { lastFrame, unmount } = await renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders a standard UUID-formatted session ID in the footer', async () => {
    const uuidSessionId = '1234-abcd-5678-efgh';
    const { lastFrame, unmount } = await renderWithMockedStats(
      emptyMetrics,
      uuidSessionId,
    );
    const output = lastFrame();

    // Standard UUID characters should not be escaped/quoted by default for bash.
    expect(output).toContain('gemini --resume 1234-abcd-5678-efgh');
    unmount();
  });

  it('sanitizes a malicious session ID in the footer', async () => {
    const maliciousSessionId = "'; rm -rf / #";
    const { lastFrame, unmount } = await renderWithMockedStats(
      emptyMetrics,
      maliciousSessionId,
    );
    const output = lastFrame();

    // escapeShellArg (using shell-quote for bash) will wrap special characters in double quotes.
    expect(output).toContain('gemini --resume "\'; rm -rf / #"');
    unmount();
  });
});
