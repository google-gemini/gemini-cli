/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { PerfDisplay } from './PerfDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';
import { ToolCallDecision } from '@google/gemini-cli-core';
import type { StartupPhaseStats } from '@google/gemini-cli-core';

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

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

const renderWithMockedStats = async (
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  },
  startupPhases: StartupPhaseStats[] | null,
  metrics: SessionMetrics = emptyMetrics,
) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId: 'test-session-id',
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 0,
    },
    getPromptCount: () => 0,
    startNewPrompt: vi.fn(),
  });

  const result = render(
    <PerfDisplay memoryUsage={memoryUsage} startupPhases={startupPhases} />,
  );
  await result.waitUntilReady();
  return result;
};

describe('<PerfDisplay />', () => {
  const baseMemory = {
    rss: 100 * 1024 * 1024,
    heapUsed: 50 * 1024 * 1024,
    heapTotal: 100 * 1024 * 1024,
    external: 5 * 1024 * 1024,
  };

  it('should render the Performance Stats header', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    expect(lastFrame()).toContain('Performance Stats');
    unmount();
  });

  it('should render memory usage section', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    const output = lastFrame();
    expect(output).toContain('Memory Usage');
    expect(output).toContain('RSS:');
    expect(output).toContain('Heap Used:');
    expect(output).toContain('External:');
    unmount();
  });

  it('should display correct MB values for memory', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    const output = lastFrame();
    expect(output).toContain('100.0 MB'); // RSS
    expect(output).toContain('50.0 / 100.0 MB'); // Heap Used / Total
    expect(output).toContain('5.0 MB'); // External
    unmount();
  });

  it('should show "no startup data" message when startupPhases is null', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    expect(lastFrame()).toContain(
      'No startup timing data was recorded for this session.',
    );
    unmount();
  });

  it('should render startup phase rows when phases are provided', async () => {
    const phases: StartupPhaseStats[] = [
      {
        name: 'config-load',
        duration_ms: 42.5,
        cpu_usage_user_usec: 1000,
        cpu_usage_system_usec: 500,
        start_time_usec: 0,
        end_time_usec: 42500,
      },
      {
        name: 'tool-discovery',
        duration_ms: 100.0,
        cpu_usage_user_usec: 2000,
        cpu_usage_system_usec: 800,
        start_time_usec: 42500,
        end_time_usec: 142500,
      },
    ];

    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      phases,
    );
    const output = lastFrame();
    expect(output).toContain('config-load');
    expect(output).toContain('42.5 ms');
    expect(output).toContain('tool-discovery');
    expect(output).toContain('100.0 ms');
    unmount();
  });

  it('should render runtime performance section', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    const output = lastFrame();
    expect(output).toContain('Runtime Performance');
    expect(output).toContain('API Time:');
    expect(output).toContain('Tool Time:');
    expect(output).toContain('Cache Efficiency:');
    unmount();
  });

  it('should display heap percentage', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    // heapUsed=50MB, heapTotal=100MB → 50.0%
    expect(lastFrame()).toContain('50.0%');
    unmount();
  });

  it('should match snapshot with no startup phases', async () => {
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      null,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should match snapshot with startup phases', async () => {
    const phases: StartupPhaseStats[] = [
      {
        name: 'init',
        duration_ms: 10.0,
        cpu_usage_user_usec: 500,
        cpu_usage_system_usec: 200,
        start_time_usec: 0,
        end_time_usec: 10000,
      },
    ];
    const { lastFrame, unmount } = await renderWithMockedStats(
      baseMemory,
      phases,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
