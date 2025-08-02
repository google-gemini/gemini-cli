/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';
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

  return render(<ToolStatsDisplay />);
};

describe('<ToolStatsDisplay />', () => {
  it('should render "no tool calls" message when there are no active tools', () => {
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
      'No tool calls have been made in this session.',
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should display stats for a single tool correctly', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 100,
        totalDecisions: { accept: 1, reject: 0, modify: 0 },
        byName: {
          'test-tool': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 100,
            decisions: { accept: 1, reject: 0, modify: 0 },
          },
        },
      },
    });

    const output = lastFrame();
    expect(output).toContain('test-tool');
    expect(output).toMatchSnapshot();
  });

  it('should display stats for multiple tools correctly', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 3,
        totalSuccess: 2,
        totalFail: 1,
        totalDurationMs: 300,
        totalDecisions: { accept: 1, reject: 1, modify: 1 },
        byName: {
          'tool-a': {
            count: 2,
            success: 1,
            fail: 1,
            durationMs: 200,
            decisions: { accept: 1, reject: 1, modify: 0 },
          },
          'tool-b': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 100,
            decisions: { accept: 0, reject: 0, modify: 1 },
          },
        },
      },
    });

    const output = lastFrame();
    expect(output).toContain('tool-a');
    expect(output).toContain('tool-b');
    expect(output).toMatchSnapshot();
  });

  it('should handle large values without wrapping or overlapping', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 999999999,
        totalSuccess: 888888888,
        totalFail: 111111111,
        totalDurationMs: 987654321,
        totalDecisions: {
          accept: 123456789,
          reject: 98765432,
          modify: 12345,
        },
        byName: {
          'long-named-tool-for-testing-wrapping-and-such': {
            count: 999999999,
            success: 888888888,
            fail: 111111111,
            durationMs: 987654321,
            decisions: {
              accept: 123456789,
              reject: 98765432,
              modify: 12345,
            },
          },
        },
      },
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should handle zero decisions gracefully', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 100,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {
          'test-tool': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 100,
            decisions: { accept: 0, reject: 0, modify: 0 },
          },
        },
      },
    });

    const output = lastFrame();
    expect(output).toContain('Total Reviewed Suggestions:');
    expect(output).toContain('0');
    expect(output).toContain('Overall Agreement Rate:');
    expect(output).toContain('--');
    expect(output).toMatchSnapshot();
  });
});
