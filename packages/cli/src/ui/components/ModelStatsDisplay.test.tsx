/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';

// Mock the context to provide controlled data for testing
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
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  return render(<ModelStatsDisplay />);
};

describe('<ModelStatsDisplay />', () => {
  beforeAll(() => {
    vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
      this: number,
    ) {
      // Use a stable 'en-US' format for test consistency.
      return new Intl.NumberFormat('en-US').format(this);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should render "no API calls" message when there are no active models', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should not display conditional rows if no model has data for them', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
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
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    const output = lastFrame();
    expect(output).not.toContain('Cached');
    expect(output).not.toContain('Thoughts');
    expect(output).not.toContain('Tool');
    expect(output).toMatchSnapshot();
  });

  it('should display conditional rows if at least one model has data', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 5,
            thoughts: 2,
            tool: 0,
          },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 50 },
          tokens: {
            prompt: 5,
            candidates: 10,
            total: 15,
            cached: 0,
            thoughts: 0,
            tool: 3,
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
    });

    const output = lastFrame();
    expect(output).toContain('Cached');
    expect(output).toContain('Thoughts');
    expect(output).toContain('Tool');
    expect(output).toMatchSnapshot();
  });

  it('should display stats for multiple models correctly', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 1000 },
          tokens: {
            prompt: 100,
            candidates: 200,
            total: 300,
            cached: 50,
            thoughts: 10,
            tool: 5,
          },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 20, totalErrors: 2, totalLatencyMs: 500 },
          tokens: {
            prompt: 200,
            candidates: 400,
            total: 600,
            cached: 100,
            thoughts: 20,
            tool: 10,
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
    });

    const output = lastFrame();
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-flash');
    expect(output).toMatchSnapshot();
  });

  it('should handle large values without wrapping or overlapping', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: {
            totalRequests: 999999999,
            totalErrors: 123456789,
            totalLatencyMs: 9876,
          },
          tokens: {
            prompt: 987654321,
            candidates: 123456789,
            total: 999999999,
            cached: 123456789,
            thoughts: 111111111,
            tool: 222222222,
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
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should display a single model correctly', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 5,
            thoughts: 2,
            tool: 1,
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
    });

    const output = lastFrame();
    expect(output).toContain('gemini-2.5-pro');
    expect(output).not.toContain('gemini-2.5-flash');
    expect(output).toMatchSnapshot();
  });
});
