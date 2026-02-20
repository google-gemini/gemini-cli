/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import * as SettingsContext from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';
import { ToolCallDecision, LlmRole } from '@google/gemini-cli-core';

// Mock the context to provide controlled data for testing
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

vi.mock('../contexts/SettingsContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsContext>();
  return {
    ...actual,
    useSettings: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);
const useSettingsMock = vi.mocked(SettingsContext.useSettings);

const renderWithMockedStats = async (
  metrics: SessionMetrics,
  width?: number,
  currentModel: string = 'gemini-2.5-pro',
) => {
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

  useSettingsMock.mockReturnValue({
    merged: {
      ui: {
        showUserIdentity: true,
      },
    },
  } as unknown as LoadedSettings);

  const result = render(
    <ModelStatsDisplay currentModel={currentModel} />,
    width,
  );
  await result.waitUntilReady();
  return result;
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

  it('should render "no API calls" message when there are no active models', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
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
    });

    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should not display conditional rows if no model has data for them', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
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
          roles: {},
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).not.toContain('Cache Reads');
    expect(output).not.toContain('Thoughts');
    expect(output).not.toContain('Tool');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should display conditional rows if at least one model has data', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            input: 5,
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 5,
            thoughts: 2,
            tool: 0,
          },
          roles: {},
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 50 },
          tokens: {
            input: 5,
            prompt: 5,
            candidates: 10,
            total: 15,
            cached: 0,
            thoughts: 0,
            tool: 3,
          },
          roles: {},
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).toContain('Cache Reads');
    expect(output).toContain('Thoughts');
    expect(output).toContain('Tool');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should display stats for multiple models correctly', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 1000 },
          tokens: {
            input: 50,
            prompt: 100,
            candidates: 200,
            total: 300,
            cached: 50,
            thoughts: 10,
            tool: 5,
          },
          roles: {},
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 20, totalErrors: 2, totalLatencyMs: 500 },
          tokens: {
            input: 100,
            prompt: 200,
            candidates: 400,
            total: 600,
            cached: 100,
            thoughts: 20,
            tool: 10,
          },
          roles: {},
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-flash');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should handle large values without wrapping or overlapping', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: {
            totalRequests: 999999999,
            totalErrors: 123456789,
            totalLatencyMs: 9876,
          },
          tokens: {
            input: 987654321 - 123456789,
            prompt: 987654321,
            candidates: 123456789,
            total: 999999999,
            cached: 123456789,
            thoughts: 111111111,
            tool: 222222222,
          },
          roles: {},
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should display a single model correctly', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            input: 5,
            prompt: 10,
            candidates: 20,
            total: 30,
            cached: 5,
            thoughts: 2,
            tool: 1,
          },
          roles: {},
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).toContain('gemini-2.5-pro');
    expect(output).not.toContain('gemini-2.5-flash');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should handle models with long names (gemini-3-*-preview) without layout breaking', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      {
        models: {
          'gemini-3-pro-preview': {
            api: { totalRequests: 10, totalErrors: 0, totalLatencyMs: 2000 },
            tokens: {
              input: 1000,
              prompt: 2000,
              candidates: 4000,
              total: 6000,
              cached: 500,
              thoughts: 100,
              tool: 50,
            },
            roles: {},
          },
          'gemini-3-flash-preview': {
            api: { totalRequests: 20, totalErrors: 0, totalLatencyMs: 1000 },
            tokens: {
              input: 2000,
              prompt: 4000,
              candidates: 8000,
              total: 12000,
              cached: 1000,
              thoughts: 200,
              tool: 100,
            },
            roles: {},
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
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      },
      80,
      'auto-gemini-3',
    );

    const output = lastFrame();
    expect(output).toContain('gemini-3-pro-');
    expect(output).toContain('gemini-3-flash-');
    unmount();
  });

  it('should display role breakdown correctly', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 200 },
          tokens: {
            input: 20,
            prompt: 30,
            candidates: 40,
            total: 70,
            cached: 10,
            thoughts: 0,
            tool: 0,
          },
          roles: {
            [LlmRole.MAIN]: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 100,
              tokens: {
                input: 10,
                prompt: 15,
                candidates: 20,
                total: 35,
                cached: 5,
                thoughts: 0,
                tool: 0,
              },
            },
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).toContain('main');
    expect(output).toContain('Input');
    expect(output).toContain('Output');
    expect(output).toContain('Cache Reads');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should render user identity information when provided', async () => {
    useSettingsMock.mockReturnValue({
      merged: {
        ui: {
          showUserIdentity: true,
        },
      },
    } as unknown as LoadedSettings);

    useSessionStatsMock.mockReturnValue({
      stats: {
        sessionId: 'test-session',
        sessionStartTime: new Date(),
        metrics: {
          models: {
            'gemini-2.5-pro': {
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
              roles: {},
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
            totalLinesAdded: 0,
            totalLinesRemoved: 0,
          },
        },
        lastPromptTokenCount: 0,
        promptCount: 5,
      },

      getPromptCount: () => 5,
      startNewPrompt: vi.fn(),
    });

    const { lastFrame, waitUntilReady, unmount } = render(
      <ModelStatsDisplay
        selectedAuthType="oauth"
        userEmail="test@example.com"
        tier="Pro"
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Auth Method:');
    expect(output).toContain('Logged in with Google');
    expect(output).toContain('(test@example.com)');
    expect(output).toContain('Tier:');
    expect(output).toContain('Pro');
    unmount();
  });

  it('should handle long role name layout', async () => {
    // Use the longest valid role name to test layout
    const longRoleName = LlmRole.UTILITY_LOOP_DETECTOR;

    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
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
          roles: {
            [longRoleName]: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 100,
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).toContain(longRoleName);
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should filter out invalid role names', async () => {
    const invalidRoleName =
      'this_is_a_very_long_role_name_that_should_be_wrapped' as LlmRole;
    const { lastFrame, unmount } = await renderWithMockedStats({
      models: {
        'gemini-2.5-pro': {
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
          roles: {
            [invalidRoleName]: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 100,
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
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    });

    const output = lastFrame();
    expect(output).not.toContain(invalidRoleName);
    expect(output).toMatchSnapshot();
    unmount();
  });
});
