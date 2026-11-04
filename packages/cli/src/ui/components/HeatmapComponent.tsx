/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  DEFAULT_HEATMAP_WINDOW_DAYS,
  addCalendarDays,
  formatLocalDateKey,
  parseDateKeyToUtcMs,
  type DailyUsageSummary,
  type HeatmapDataset,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';

export const DEFAULT_HEATMAP_WEEKS = 28;
const GRID_CHROME_COLUMNS = 9; // 2 border + 4 paddingX + 4 weekday label - 1 trailing space

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const WEEKDAY_ROW_LABELS = [
  '    ',
  'Mon ',
  '    ',
  'Wed ',
  '    ',
  'Fri ',
  '    ',
] as const;

export type HeatmapIntensityLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapDatasetInput {
  dailyUsage:
    | ReadonlyMap<string, DailyUsageSummary>
    | Record<string, DailyUsageSummary>;
  totalWindowTokens: number;
  totalWindowSessions?: number;
  totalWindowTurns?: number;
  currentStreak: number;
  longestStreak: number;
}

export interface HeatmapComponentProps {
  dataset: HeatmapDataset | HeatmapDatasetInput;
  selectedDate?: string;
  today?: string;
  terminalWidth?: number;
}

interface GridCell {
  dateKey: string;
  tokens: number;
  isFuture: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSafeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function isModelTokenEntry(
  entry: [string, unknown],
): entry is [string, number] {
  const [, count] = entry;
  return typeof count === 'number' && Number.isFinite(count);
}

function isUsageMap(
  source: HeatmapDatasetInput['dailyUsage'],
): source is ReadonlyMap<string, DailyUsageSummary> {
  return source instanceof Map;
}

function getUsageForDate(
  source: HeatmapDatasetInput['dailyUsage'] | undefined,
  dateKey: string,
): DailyUsageSummary | undefined {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const entry = isUsageMap(source)
    ? source.get(dateKey)
    : Object.prototype.hasOwnProperty.call(source, dateKey)
      ? source[dateKey]
      : undefined;
  return entry && typeof entry === 'object' && !Array.isArray(entry)
    ? entry
    : undefined;
}

function interpolateQuartile(sortedAsc: readonly number[], p: number): number {
  const pos = p * (sortedAsc.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) {
    return sortedAsc[lower];
  }
  return (
    sortedAsc[lower] + (sortedAsc[upper] - sortedAsc[lower]) * (pos - lower)
  );
}

export function createIntensityClassifier(
  nonZeroValues: readonly number[],
): (tokens: number) => HeatmapIntensityLevel {
  if (nonZeroValues.length === 0) {
    return () => 0;
  }

  const sorted = [...nonZeroValues].sort((a, b) => a - b);
  const minVal = sorted[0];
  const maxVal = sorted[sorted.length - 1];

  if (minVal === maxVal) {
    return (tokens: number) => (tokens > 0 ? 4 : 0);
  }

  const q1 = interpolateQuartile(sorted, 0.25);
  const q2 = interpolateQuartile(sorted, 0.5);
  const q3 = interpolateQuartile(sorted, 0.75);

  return (tokens: number): HeatmapIntensityLevel => {
    if (tokens <= 0) {
      return 0;
    }
    if (tokens > q3) {
      return 4;
    }
    if (tokens > q2) {
      return 3;
    }
    if (tokens > q1) {
      return 2;
    }
    return 1;
  };
}

export function getHeatmapLevelColor(level: HeatmapIntensityLevel): string {
  switch (level) {
    case 0:
      return theme.ui.dark;
    case 1:
      return theme.ui.comment;
    case 2:
      return theme.status.warning;
    case 3:
      return theme.text.accent;
    case 4:
      return theme.status.success;
    default:
      return theme.ui.dark;
  }
}

export function computeVisibleWeeks(availableColumns: number): number {
  const fittingWeeks = Math.floor((availableColumns - GRID_CHROME_COLUMNS) / 2);
  return Math.max(1, Math.min(DEFAULT_HEATMAP_WEEKS, fittingWeeks));
}

function getMonthIndexFromDateKey(dateKey: string): number {
  const month = Number.parseInt(dateKey.slice(5, 7), 10);
  return Number.isNaN(month) ? 0 : Math.max(0, Math.min(11, month - 1));
}

function getWeekTransitionMonth(week: readonly GridCell[]): number | null {
  for (const cell of week) {
    if (!cell.isFuture && cell.dateKey.endsWith('-01')) {
      return getMonthIndexFromDateKey(cell.dateKey);
    }
  }
  return null;
}

function buildMonthHeaderLine(
  weeks: ReadonlyArray<readonly GridCell[]>,
): string {
  const weekCount = weeks.length;
  const lineWidth = Math.max(3, weekCount * 2 - 1);
  const chars = Array.from({ length: lineWidth }, () => ' ');
  let nextAvailableIndex = 0;

  for (let w = 0; w < weekCount; w++) {
    let monthIdx: number | null = null;
    if (w === 0) {
      const nextWeekStartsMonth =
        weekCount > 1 && getWeekTransitionMonth(weeks[1]) !== null;
      if (!nextWeekStartsMonth) {
        monthIdx = getMonthIndexFromDateKey(weeks[0][0].dateKey);
      }
    } else {
      monthIdx = getWeekTransitionMonth(weeks[w]);
    }

    if (monthIdx === null) {
      continue;
    }

    const colStart = w * 2;
    if (colStart >= nextAvailableIndex && colStart + 3 <= lineWidth) {
      const label = MONTH_LABELS[monthIdx];
      chars[colStart] = label[0];
      chars[colStart + 1] = label[1];
      chars[colStart + 2] = label[2];
      nextAvailableIndex = colStart + 4;
    }
  }

  return chars.join('').trimEnd();
}

function formatCountWithNoun(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export const HeatmapComponent: React.FC<HeatmapComponentProps> = ({
  dataset,
  selectedDate,
  today,
  terminalWidth,
}) => {
  const effectiveColumns = terminalWidth ?? process.stdout.columns ?? 80;
  const visibleWeeks = computeVisibleWeeks(effectiveColumns);

  const todayKey =
    today && parseDateKeyToUtcMs(today) !== null
      ? today
      : formatLocalDateKey(new Date());
  const todayUtcMs = parseDateKeyToUtcMs(todayKey) ?? Date.now();
  const todayDayOfWeek = new Date(todayUtcMs).getUTCDay();
  const currentWeekSundayKey = addCalendarDays(todayKey, -todayDayOfWeek);
  const firstWeekSundayKey = addCalendarDays(
    currentWeekSundayKey,
    -(visibleWeeks - 1) * 7,
  );

  const weeks: GridCell[][] = [];
  const nonZeroValues: number[] = [];
  let fallbackWindowSessions = 0;
  let fallbackWindowTurns = 0;

  for (let w = 0; w < visibleWeeks; w++) {
    const weekCells: GridCell[] = [];
    for (let r = 0; r < 7; r++) {
      const dateKey = addCalendarDays(firstWeekSundayKey, w * 7 + r);
      const isFuture = dateKey > todayKey;
      const daySummary = isFuture
        ? undefined
        : getUsageForDate(dataset.dailyUsage, dateKey);
      const tokens = toSafeCount(daySummary?.totalTokens);
      if (!isFuture) {
        fallbackWindowSessions += toSafeCount(daySummary?.sessions);
        fallbackWindowTurns += toSafeCount(daySummary?.turns);
        if (tokens > 0) {
          nonZeroValues.push(tokens);
        }
      }
      weekCells.push({ dateKey, tokens, isFuture });
    }
    weeks.push(weekCells);
  }

  const windowTokens = toSafeCount(dataset.totalWindowTokens);
  const windowSessions =
    typeof dataset.totalWindowSessions === 'number' &&
    Number.isFinite(dataset.totalWindowSessions)
      ? Math.max(0, dataset.totalWindowSessions)
      : fallbackWindowSessions;
  const windowTurns =
    typeof dataset.totalWindowTurns === 'number' &&
    Number.isFinite(dataset.totalWindowTurns)
      ? Math.max(0, dataset.totalWindowTurns)
      : fallbackWindowTurns;
  const currentStreak = toSafeCount(dataset.currentStreak);
  const longestStreak = toSafeCount(dataset.longestStreak);

  const classifyIntensity = createIntensityClassifier(nonZeroValues);
  const monthHeaderLine = buildMonthHeaderLine(weeks);
  const selectedDaySummary = selectedDate
    ? getUsageForDate(dataset.dailyUsage, selectedDate)
    : undefined;
  const selectedTotalTokens = toSafeCount(selectedDaySummary?.totalTokens);
  const rawModelBreakdown: unknown = selectedDaySummary?.modelBreakdown;
  const sortedModels = isPlainObject(rawModelBreakdown)
    ? Object.entries(rawModelBreakdown)
        .filter(isModelTokenEntry)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    : [];

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
    >
      <Text bold color={theme.text.accent}>
        Token Usage Heatmap
      </Text>
      <Box height={1} />

      {/* Month header row */}
      <Text color={theme.text.secondary}>{'    ' + monthHeaderLine}</Text>

      {/* 7 weekday rows (Sun-Sat with Mon, Wed, Fri labels) */}
      {WEEKDAY_ROW_LABELS.map((rowLabel, rowIdx) => (
        <Text key={rowIdx}>
          <Text color={theme.text.secondary}>{rowLabel}</Text>
          {weeks.map((week, weekIdx) => {
            const cell = week[rowIdx];
            const spacer = weekIdx < visibleWeeks - 1 ? ' ' : '';
            if (cell.isFuture) {
              return <Text key={cell.dateKey}>{' ' + spacer}</Text>;
            }
            const level = classifyIntensity(cell.tokens);
            return (
              <Text key={cell.dateKey}>
                <Text color={getHeatmapLevelColor(level)}>■</Text>
                {spacer}
              </Text>
            );
          })}
        </Text>
      ))}

      {/* Semantic color legend */}
      <Box marginTop={1}>
        <Text>
          <Text color={theme.text.secondary}>Less </Text>
          <Text color={theme.ui.dark}>■</Text>{' '}
          <Text color={theme.ui.comment}>■</Text>{' '}
          <Text color={theme.status.warning}>■</Text>{' '}
          <Text color={theme.text.accent}>■</Text>{' '}
          <Text color={theme.status.success}>■</Text>
          <Text color={theme.text.secondary}> More</Text>
        </Text>
      </Box>

      {/* Window total & streak summary */}
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text bold color={theme.text.primary}>
            Summary{' '}
          </Text>
          <Text color={theme.text.secondary}>
            (last {DEFAULT_HEATMAP_WEEKS} weeks / {DEFAULT_HEATMAP_WINDOW_DAYS}{' '}
            days)
          </Text>
        </Text>
        <Text>
          <Text color={theme.text.link}>Total Tokens: </Text>
          <Text color={theme.text.primary}>
            {windowTokens.toLocaleString()}
          </Text>
          <Text color={theme.text.secondary}> · </Text>
          <Text color={theme.text.primary}>
            {formatCountWithNoun(windowSessions, 'session', 'sessions')}
          </Text>
          <Text color={theme.text.secondary}> · </Text>
          <Text color={theme.text.primary}>
            {formatCountWithNoun(windowTurns, 'turn', 'turns')}
          </Text>
        </Text>
        <Text>
          <Text color={theme.text.link}>Current streak: </Text>
          <Text color={theme.text.primary}>
            {formatCountWithNoun(currentStreak, 'day', 'days')}
          </Text>
          <Text color={theme.text.secondary}> · </Text>
          <Text color={theme.text.link}>Longest streak: </Text>
          <Text color={theme.text.primary}>
            {formatCountWithNoun(longestStreak, 'day', 'days')}
          </Text>
        </Text>
      </Box>

      {/* Optional day drill-down */}
      {selectedDate && (
        <Box flexDirection="column" marginTop={1}>
          <Box
            borderStyle="single"
            borderBottom={true}
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor={theme.border.default}
            marginBottom={1}
          />
          {!selectedDaySummary || selectedTotalTokens === 0 ? (
            <Text color={theme.text.secondary}>
              No token usage recorded for {selectedDate}
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text bold color={theme.text.primary}>
                Breakdown for {selectedDate}
              </Text>
              <Text>
                <Text color={theme.text.link}>Total Tokens: </Text>
                <Text color={theme.text.primary}>
                  {selectedTotalTokens.toLocaleString()}
                </Text>
              </Text>
              <Text>
                <Text color={theme.text.link}>Token Split: </Text>
                <Text color={theme.text.primary}>
                  {toSafeCount(selectedDaySummary.inputTokens).toLocaleString()}{' '}
                  input ·{' '}
                  {toSafeCount(
                    selectedDaySummary.outputTokens,
                  ).toLocaleString()}{' '}
                  output ·{' '}
                  {toSafeCount(
                    selectedDaySummary.cachedTokens,
                  ).toLocaleString()}{' '}
                  cached
                </Text>
              </Text>
              <Text>
                <Text color={theme.text.link}>Activity: </Text>
                <Text color={theme.text.primary}>
                  {formatCountWithNoun(
                    toSafeCount(selectedDaySummary.sessions),
                    'session',
                    'sessions',
                  )}{' '}
                  ·{' '}
                  {formatCountWithNoun(
                    toSafeCount(selectedDaySummary.turns),
                    'turn',
                    'turns',
                  )}
                </Text>
              </Text>
              {sortedModels.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color={theme.text.secondary}>
                    Models
                  </Text>
                  {sortedModels.map(([modelName, modelTokens]) => (
                    <Box key={modelName} paddingLeft={2}>
                      <Text>
                        <Text color={theme.text.secondary}>
                          » {modelName}:{' '}
                        </Text>
                        <Text color={theme.text.primary}>
                          {modelTokens.toLocaleString()} tokens
                        </Text>
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
