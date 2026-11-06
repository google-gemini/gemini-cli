/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DailyUsageSummary,
  HeatmapDataset,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { theme } from '../semantic-colors.js';
import {
  DEFAULT_HEATMAP_WEEKS,
  HeatmapComponent,
  computeVisibleWeeks,
  createIntensityClassifier,
  getHeatmapLevelColor,
} from './HeatmapComponent.js';

function makeSummary(
  date: string,
  overrides: Partial<DailyUsageSummary> = {},
): DailyUsageSummary {
  return {
    date,
    totalTokens: 1000,
    inputTokens: 600,
    outputTokens: 400,
    cachedTokens: 100,
    turns: 2,
    sessions: 1,
    modelBreakdown: { 'gemini-2.5-pro': 1000 },
    ...overrides,
  };
}

describe('<HeatmapComponent />', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
    vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
      this: number,
    ) {
      return new Intl.NumberFormat('en-US').format(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('intensity & layout helpers', () => {
    it('classifies token counts across quartiles and maps semantic theme colors', () => {
      const emptyClassify = createIntensityClassifier([]);
      expect(emptyClassify(0)).toBe(0);
      expect(emptyClassify(500)).toBe(0);

      const singleClassify = createIntensityClassifier([250]);
      expect(singleClassify(0)).toBe(0);
      expect(singleClassify(250)).toBe(4);

      const quartileClassify = createIntensityClassifier([100, 200, 300, 400]);
      expect(quartileClassify(0)).toBe(0);
      expect(quartileClassify(100)).toBe(1);
      expect(quartileClassify(200)).toBe(2);
      expect(quartileClassify(300)).toBe(3);
      expect(quartileClassify(400)).toBe(4);

      expect(getHeatmapLevelColor(0)).toBe(theme.ui.dark);
      expect(getHeatmapLevelColor(1)).toBe(theme.ui.comment);
      expect(getHeatmapLevelColor(2)).toBe(theme.status.warning);
      expect(getHeatmapLevelColor(3)).toBe(theme.text.accent);
      expect(getHeatmapLevelColor(4)).toBe(theme.status.success);
    });

    it('caps default view at 28 weeks and clamps dynamically on narrow terminals', () => {
      expect(computeVisibleWeeks(120)).toBe(DEFAULT_HEATMAP_WEEKS);
      expect(computeVisibleWeeks(80)).toBe(28);
      expect(computeVisibleWeeks(65)).toBe(28);
      expect(computeVisibleWeeks(50)).toBe(20);
      expect(computeVisibleWeeks(12)).toBe(1);
    });
  });

  it('renders 28-week grid, weekday labels, month headers, legend, and streak summary', async () => {
    const dailyUsage = new Map<string, DailyUsageSummary>([
      ['2026-06-15', makeSummary('2026-06-15', { totalTokens: 500 })],
      ['2026-08-20', makeSummary('2026-08-20', { totalTokens: 2500 })],
      ['2026-11-01', makeSummary('2026-11-01', { totalTokens: 5000 })],
      ['2026-11-02', makeSummary('2026-11-02', { totalTokens: 8500 })],
      ['2026-11-03', makeSummary('2026-11-03', { totalTokens: 12500 })],
    ]);
    const dataset: HeatmapDataset = {
      dailyUsage,
      totalWindowTokens: 29000,
      totalWindowSessions: 4,
      totalWindowTurns: 10,
      currentStreak: 3,
      longestStreak: 7,
    };

    const renderResult = await renderWithProviders(
      <HeatmapComponent
        dataset={dataset}
        today="2026-11-03"
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await renderResult.waitUntilReady();

    const frame = renderResult.lastFrame();
    expect(frame).toContain('Token Usage Heatmap');
    expect(frame).toContain('Mon');
    expect(frame).toContain('Wed');
    expect(frame).toContain('Fri');
    expect(frame).toContain('Less ■ ■ ■ ■ ■ More');
    expect(frame).toContain('Summary (last 28 weeks / 196 days)');
    expect(frame).toContain('Total Tokens: 29,000 · 4 sessions · 10 turns');
    expect(frame).toContain('Current streak: 3 days · Longest streak: 7 days');

    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('clamps visible weeks dynamically on narrow terminals (<65 columns) without wrapping', async () => {
    const dataset = {
      dailyUsage: {
        '2026-11-03': makeSummary('2026-11-03', { totalTokens: 1200 }),
      },
      totalWindowTokens: 1200,
      currentStreak: 1,
      longestStreak: 1,
    };

    const renderResult = await renderWithProviders(
      <HeatmapComponent
        dataset={dataset}
        today="2026-11-03"
        terminalWidth={50}
      />,
      { width: 50 },
    );
    await renderResult.waitUntilReady();

    const frame = renderResult.lastFrame();
    const lines = frame.split('\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(50);
    }
    expect(frame).toContain('Current streak: 1 day');
    renderResult.unmount();
  });

  it('renders detailed day breakdown with token split, activity, and per-model usage', async () => {
    const dataset = {
      dailyUsage: {
        '2026-11-02': makeSummary('2026-11-02', { totalTokens: 4000 }),
        '2026-11-03': makeSummary('2026-11-03', {
          totalTokens: 12500,
          inputTokens: 8000,
          outputTokens: 4500,
          cachedTokens: 2000,
          sessions: 2,
          turns: 5,
          modelBreakdown: {
            'gemini-2.5-flash': 3500,
            'gemini-2.5-pro': 9000,
          },
        }),
      },
      totalWindowTokens: 16500,
      currentStreak: 2,
      longestStreak: 5,
    };

    const renderResult = await renderWithProviders(
      <HeatmapComponent
        dataset={dataset}
        today="2026-11-03"
        selectedDate="2026-11-03"
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await renderResult.waitUntilReady();

    const frame = renderResult.lastFrame();
    expect(frame).toContain('Breakdown for 2026-11-03');
    expect(frame).toContain('Total Tokens: 12,500');
    expect(frame).toContain(
      'Token Split: 8,000 input · 4,500 output · 2,000 cached',
    );
    expect(frame).toContain('Activity: 2 sessions · 5 turns');
    expect(frame).toContain('gemini-2.5-pro: 9,000 tokens');
    expect(frame).toContain('gemini-2.5-flash: 3,500 tokens');

    await expect(renderResult).toMatchSvgSnapshot();
    renderResult.unmount();
  });

  it('renders fallback message when selected date has zero recorded token usage', async () => {
    const dataset = {
      dailyUsage: {
        '2026-11-03': makeSummary('2026-11-03', { totalTokens: 1500 }),
      },
      totalWindowTokens: 1500,
      currentStreak: 1,
      longestStreak: 1,
    };

    const renderResult = await renderWithProviders(
      <HeatmapComponent
        dataset={dataset}
        today="2026-11-03"
        selectedDate="2026-11-01"
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await renderResult.waitUntilReady();

    expect(renderResult.lastFrame()).toContain(
      'No token usage recorded for 2026-11-01',
    );
    renderResult.unmount();
  });

  it('safely renders partially deserialized usage summaries missing modelBreakdown or numeric fields', async () => {
    const partialEntry = {
      date: '2026-11-03',
      totalTokens: 500,
    } as unknown as DailyUsageSummary;

    const dataset = {
      dailyUsage: {
        '2026-11-03': partialEntry,
      },
      totalWindowTokens: 500,
      currentStreak: 1,
      longestStreak: 1,
    };

    const renderResult = await renderWithProviders(
      <HeatmapComponent
        dataset={dataset}
        today="2026-11-03"
        selectedDate="2026-11-03"
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await renderResult.waitUntilReady();

    const frame = renderResult.lastFrame();
    expect(frame).toContain('Breakdown for 2026-11-03');
    expect(frame).toContain('Total Tokens: 500');
    expect(frame).toContain('Token Split: 0 input · 0 output · 0 cached');
    expect(frame).toContain('Activity: 0 sessions · 0 turns');
    expect(frame).not.toContain('Models');
    renderResult.unmount();
  });
});
