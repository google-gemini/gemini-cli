/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { StatsDisplay } from './StatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { type SessionMetrics } from '../contexts/SessionContext.js';
import { ToolCallDecision } from '@google/gemini-cli-core';

// Mock the context to provide controlled data for testing
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = async (metrics: SessionMetrics) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId: 'test-session-id',
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  return renderWithProviders(<StatsDisplay duration="1s" />, {
    width: 100,
  });
};

// Helper to create metrics with default zero values
const createTestMetrics = (
  overrides: Partial<SessionMetrics> = {},
): SessionMetrics => ({
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
  ...overrides,
});

describe('<StatsDisplay />', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders only the Performance section in its zero state', async () => {
    const zeroMetrics = createTestMetrics();

    const { lastFrame } = await renderWithMockedStats(zeroMetrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toMatchSnapshot();
  });

  it('renders a table with two models correctly', async () => {
    const metrics = createTestMetrics({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 15000 },
          tokens: {
            input: 500,
            prompt: 1000,
            candidates: 2000,
            total: 43234,
            cached: 500,
            thoughts: 100,
            tool: 50,
          },
          roles: {},
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 5, totalErrors: 1, totalLatencyMs: 4500 },
          tokens: {
            input: 15000,
            prompt: 25000,
            candidates: 15000,
            total: 150000000,
            cached: 10000,
            thoughts: 2000,
            tool: 1000,
          },
          roles: {},
        },
      },
    });

    const { lastFrame } = await renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toContain('Model Usage');
    expect(output).toContain('Reqs');
    expect(output).toContain('Input Tokens');
    expect(output).toContain('Cache Reads');
    expect(output).toContain('Output Tokens');
    expect(output).toMatchSnapshot();
  });

  it('renders all sections when all data is present', async () => {
    const metrics = createTestMetrics({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            input: 50,
            prompt: 100,
            candidates: 100,
            total: 250,
            cached: 50,
            thoughts: 0,
            tool: 0,
          },
          roles: {},
        },
      },
      tools: {
        totalCalls: 2,
        totalSuccess: 1,
        totalFail: 1,
        totalDurationMs: 123,
        totalDecisions: {
          accept: 1,
          reject: 0,
          modify: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
        byName: {
          'test-tool': {
            count: 2,
            success: 1,
            fail: 1,
            durationMs: 123,
            decisions: {
              accept: 1,
              reject: 0,
              modify: 0,
              [ToolCallDecision.AUTO_ACCEPT]: 0,
            },
          },
        },
      },
    });

    const { lastFrame } = await renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toContain('User Agreement');
    expect(output).toContain('Model Usage');
    expect(output).toMatchSnapshot();
  });

  describe('Conditional Rendering Tests', () => {
    it('hides User Agreement when no decisions are made', async () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 2,
          totalSuccess: 1,
          totalFail: 1,
          totalDurationMs: 123,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          }, // No decisions
          byName: {
            'test-tool': {
              count: 2,
              success: 1,
              fail: 1,
              durationMs: 123,
              decisions: {
                accept: 0,
                reject: 0,
                modify: 0,
                [ToolCallDecision.AUTO_ACCEPT]: 0,
              },
            },
          },
        },
      });

      const { lastFrame } = await renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toContain('Interaction Summary');
      expect(output).toContain('Success Rate');
      expect(output).not.toContain('User Agreement');
      expect(output).toMatchSnapshot();
    });

    it('hides Efficiency section when cache is not used', async () => {
      const metrics = createTestMetrics({
        models: {
          'gemini-2.5-pro': {
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 100,
              prompt: 100,
              candidates: 100,
              total: 200,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
            roles: {},
          },
        },
      });

      const { lastFrame } = await renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toMatchSnapshot();
    });
  });

  describe('Conditional Color Tests', () => {
    it('renders success rate in green for high values', async () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 10,
          totalSuccess: 10,
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
      });
      const { lastFrame } = await renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders success rate in yellow for medium values', async () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 10,
          totalSuccess: 9,
          totalFail: 1,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });
      const { lastFrame } = await renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders success rate in red for low values', async () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 10,
          totalSuccess: 5,
          totalFail: 5,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });
      const { lastFrame } = await renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Code Changes Display', () => {
    it('displays Code Changes when line counts are present', async () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 1,
          totalSuccess: 1,
          totalFail: 0,
          totalDurationMs: 100,
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
          totalLinesRemoved: 18,
        },
      });

      const { lastFrame } = await renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toContain('Code Changes:');
      expect(output).toContain('+42');
      expect(output).toContain('-18');
      expect(output).toMatchSnapshot();
    });

    it('hides Code Changes when no lines are added or removed', async () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 1,
          totalSuccess: 1,
          totalFail: 0,
          totalDurationMs: 100,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });

      const { lastFrame } = await renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).not.toContain('Code Changes:');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Title Rendering', () => {
    const zeroMetrics = createTestMetrics();

    it('renders the default title when no title prop is provided', async () => {
      const { lastFrame } = await renderWithMockedStats(zeroMetrics);
      const output = lastFrame();
      expect(output).toContain('Session Stats');
      expect(output).not.toContain('Agent powering down');
      expect(output).toMatchSnapshot();
    });

    it('renders the custom title when a title prop is provided', async () => {
      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics: zeroMetrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },

        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = await renderWithProviders(
        <StatsDisplay duration="1s" title="Agent powering down. Goodbye!" />,
        { width: 100 },
      );
      const output = lastFrame();
      expect(output).toContain('Agent powering down. Goodbye!');
      expect(output).not.toContain('Session Stats');
      expect(output).toMatchSnapshot();
    });
  });

  describe('User Identity Display', () => {
    it('renders User row with Auth Method and Tier', async () => {
      const metrics = createTestMetrics();

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },
        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = await renderWithProviders(
        <StatsDisplay
          duration="1s"
          selectedAuthType="oauth"
          userEmail="test@example.com"
          tier="Pro"
        />,
        { width: 100 },
      );
      const output = lastFrame();

      expect(output).toContain('Auth Method:');
      expect(output).toContain('Signed in with Google (test@example.com)');
      expect(output).toContain('Tier:');
      expect(output).toContain('Pro');
    });

    it('renders User row with API Key and no Tier', async () => {
      const metrics = createTestMetrics();

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },
        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = await renderWithProviders(
        <StatsDisplay duration="1s" selectedAuthType="Google API Key" />,
        { width: 100 },
      );
      const output = lastFrame();

      expect(output).toContain('Auth Method:');
      expect(output).toContain('Google API Key');
      expect(output).not.toContain('Tier:');
    });
  });
});
