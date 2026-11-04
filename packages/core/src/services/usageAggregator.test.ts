/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INVALID_HEATMAP_DATE_ERROR,
  addCalendarDays,
  aggregateUsageFromRecordings,
  diffCalendarDays,
  formatLocalDateKey,
  parseDateKeyToUtcMs,
  resolveHeatmapDateArg,
} from './usageAggregator.js';

describe('usageAggregator', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.stubEnv('TZ', 'UTC');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-heatmap-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('calendar date helpers & validation', () => {
    it('validates real calendar dates and rejects invalid or rollover dates', () => {
      expect(parseDateKeyToUtcMs('2026-11-03')).not.toBeNull();
      expect(parseDateKeyToUtcMs('2024-02-29')).not.toBeNull(); // Leap year
      expect(parseDateKeyToUtcMs('2025-02-29')).toBeNull(); // Non-leap year
      expect(parseDateKeyToUtcMs('2026-02-31')).toBeNull();
      expect(parseDateKeyToUtcMs('2026-13-01')).toBeNull();
      expect(parseDateKeyToUtcMs('../chats/session')).toBeNull();
    });

    it('adds and diffs calendar days without DST drift', () => {
      vi.stubEnv('TZ', 'America/Los_Angeles');
      expect(addCalendarDays('2026-03-08', 1)).toBe('2026-03-09');
      expect(addCalendarDays('2026-11-01', 1)).toBe('2026-11-02');
      expect(addCalendarDays('2026-11-02', -1)).toBe('2026-11-01');
      expect(diffCalendarDays('2026-03-07', '2026-03-09')).toBe(2);
      expect(diffCalendarDays('2024-02-28', '2024-03-01')).toBe(2);
    });

    it('resolves today, yesterday, YYYY-MM-DD, and rejects invalid arguments', () => {
      const ref = new Date('2026-11-03T15:30:00.000Z');
      expect(resolveHeatmapDateArg('', ref)).toEqual({
        ok: true,
        date: undefined,
      });
      expect(resolveHeatmapDateArg('  today ', ref)).toEqual({
        ok: true,
        date: '2026-11-03',
      });
      expect(resolveHeatmapDateArg('YESTERDAY', ref)).toEqual({
        ok: true,
        date: '2026-11-02',
      });
      expect(resolveHeatmapDateArg('2026-10-15', ref)).toEqual({
        ok: true,
        date: '2026-10-15',
      });
      expect(resolveHeatmapDateArg('2026-02-30', ref)).toEqual({
        ok: false,
        error: INVALID_HEATMAP_DATE_ERROR,
      });
      expect(resolveHeatmapDateArg('../../etc/passwd', ref)).toEqual({
        ok: false,
        error: INVALID_HEATMAP_DATE_ERROR,
      });
    });

    it('normalizes UTC ISO timestamps into local date keys', () => {
      vi.stubEnv('TZ', 'America/New_York');
      // 2026-11-03T02:30:00Z is 2026-11-02 21:30 EST
      expect(formatLocalDateKey(new Date('2026-11-03T02:30:00.000Z'))).toBe(
        '2026-11-02',
      );
    });
  });

  describe('aggregateUsageFromRecordings', () => {
    it('returns an empty dataset when directory is missing or has no .jsonl files', async () => {
      const existsSyncSpy = vi.spyOn(fsSync, 'existsSync');

      const blankResult = await aggregateUsageFromRecordings('   ');
      expect(blankResult.dailyUsage.size).toBe(0);
      expect(blankResult.totalWindowTokens).toBe(0);

      const missingPath = path.join(tempDir, 'does-not-exist');
      const missingResult = await aggregateUsageFromRecordings(missingPath);
      expect(missingResult.dailyUsage.size).toBe(0);
      expect(missingResult.totalWindowTokens).toBe(0);
      expect(missingResult.totalWindowSessions).toBe(0);
      expect(missingResult.totalWindowTurns).toBe(0);
      expect(missingResult.currentStreak).toBe(0);
      expect(missingResult.longestStreak).toBe(0);

      const notesFilePath = path.join(tempDir, 'notes.txt');
      await fs.writeFile(notesFilePath, 'ignored');
      const nonDirResult = await aggregateUsageFromRecordings(notesFilePath);
      expect(nonDirResult.dailyUsage.size).toBe(0);

      const emptyResult = await aggregateUsageFromRecordings(tempDir);
      expect(emptyResult.dailyUsage.size).toBe(0);
      expect(existsSyncSpy).not.toHaveBeenCalled();
    });

    it('aggregates MessageRecord.tokens, deduplicates repeated message IDs, and skips corrupt lines', async () => {
      const sessionA = path.join(tempDir, 'session-a.jsonl');
      const linesA = [
        JSON.stringify({
          sessionId: 'sess-a',
          projectHash: 'hash',
          startTime: '2026-11-01T10:00:00.000Z',
        }),
        // Initial message snapshot without tokens
        JSON.stringify({
          id: 'msg-1',
          type: 'gemini',
          timestamp: '2026-11-01T10:01:00.000Z',
          content: 'Hello',
          tokens: null,
          model: 'gemini-2.5-pro',
        }),
        // Updated snapshot after recordMessageTokens
        JSON.stringify({
          id: 'msg-1',
          type: 'gemini',
          timestamp: '2026-11-01T10:01:00.000Z',
          content: 'Hello',
          tokens: { input: 100, output: 50, cached: 20, total: 150 },
          model: 'gemini-2.5-pro',
        }),
        // Repeated snapshot after recordToolCalls with same ID — must NOT double count
        JSON.stringify({
          id: 'msg-1',
          type: 'gemini',
          timestamp: '2026-11-01T10:01:00.000Z',
          content: 'Hello',
          toolCalls: [{ id: 'tc-1', name: 'read_file', args: {} }],
          tokens: { input: 100, output: 50, cached: 20, total: 150 },
          model: 'gemini-2.5-pro',
        }),
        '{corrupt json line from interrupted write',
        '',
        JSON.stringify({
          id: 'msg-bad-ts',
          type: 'gemini',
          timestamp: 'not-a-timestamp',
          tokens: { input: 999, output: 999, cached: 0, total: 1998 },
        }),
        // Second turn in same session on same day with different model
        JSON.stringify({
          id: 'msg-2',
          type: 'gemini',
          timestamp: '2026-11-01T12:00:00.000Z',
          tokens: { input: 200, output: 100, cached: 50, total: 300 },
          model: 'gemini-2.5-flash',
        }),
      ];
      await fs.writeFile(sessionA, linesA.join('\n') + '\n');

      // Second session + nested subagent directory on same and next day
      const sessionB = path.join(tempDir, 'session-b.jsonl');
      await fs.writeFile(
        sessionB,
        [
          JSON.stringify({ sessionId: 'sess-b', projectHash: 'hash' }),
          JSON.stringify({
            id: 'msg-b1',
            type: 'gemini',
            timestamp: '2026-11-01T18:00:00.000Z',
            tokensSummary: {
              inputTokens: 40,
              outputTokens: 10,
              cachedTokens: 5,
            },
            model: 'gemini-2.5-pro',
          }),
          JSON.stringify({
            id: 'msg-b2',
            type: 'gemini',
            timestamp: '2026-11-02T09:00:00.000Z',
            tokens: { input: 300, output: 200, cached: 100, total: 500 },
            model: 'gemini-2.5-pro',
          }),
        ].join('\n') + '\n',
      );

      const subagentDir = path.join(tempDir, 'sess-b');
      await fs.mkdir(subagentDir);
      await fs.writeFile(
        path.join(subagentDir, 'subagent-1.jsonl'),
        [
          JSON.stringify({ sessionId: 'sub-1', projectHash: 'hash' }),
          JSON.stringify({
            id: 'msg-sub-1',
            type: 'gemini',
            timestamp: '2026-11-02T09:05:00.000Z',
            tokens: { input: 50, output: 25, cached: 0, total: 75 },
            model: 'gemini-2.5-flash',
          }),
        ].join('\n') + '\n',
      );

      const refDate = new Date('2026-11-03T10:00:00.000Z');
      const result = await aggregateUsageFromRecordings(tempDir, 196, refDate);

      const nov1 = result.dailyUsage.get('2026-11-01');
      expect(nov1).toEqual({
        date: '2026-11-01',
        inputTokens: 340,
        outputTokens: 160,
        cachedTokens: 75,
        totalTokens: 500,
        turns: 3,
        sessions: 2,
        modelBreakdown: {
          'gemini-2.5-pro': 200,
          'gemini-2.5-flash': 300,
        },
      });

      const nov2 = result.dailyUsage.get('2026-11-02');
      expect(nov2).toEqual({
        date: '2026-11-02',
        inputTokens: 350,
        outputTokens: 225,
        cachedTokens: 100,
        totalTokens: 575,
        turns: 2,
        sessions: 2,
        modelBreakdown: {
          'gemini-2.5-pro': 500,
          'gemini-2.5-flash': 75,
        },
      });

      // Today (2026-11-03) has 0 usage, but yesterday (2026-11-02) + 2026-11-01 had usage -> streak = 2
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
      expect(result.totalWindowTokens).toBe(1075);
      // sess-a, sess-b (shared across both days), and sub-1 -> 3 unique sessions, 5 turns
      expect(result.totalWindowSessions).toBe(3);
      expect(result.totalWindowTurns).toBe(5);
    });

    it('calculates longest historical streak separately from current streak and excludes out-of-window tokens', async () => {
      const logPath = path.join(tempDir, 'history.jsonl');
      const records = [
        // 4-day historical streak outside 10-day window
        '2026-01-10T12:00:00.000Z',
        '2026-01-11T12:00:00.000Z',
        '2026-01-12T12:00:00.000Z',
        '2026-01-13T12:00:00.000Z',
        // Current 2-day streak ending today
        '2026-11-02T12:00:00.000Z',
        '2026-11-03T12:00:00.000Z',
      ].map((timestamp, idx) =>
        JSON.stringify({
          id: `turn-${idx}`,
          type: 'gemini',
          timestamp,
          tokens: { input: 80, output: 20, cached: 0, total: 100 },
        }),
      );

      // Zero-token record between streaks must NOT bridge or extend streaks
      records.push(
        JSON.stringify({
          id: 'zero-turn',
          type: 'gemini',
          timestamp: '2026-11-01T12:00:00.000Z',
          tokens: { input: 0, output: 0, cached: 0, total: 0 },
        }),
      );

      await fs.writeFile(logPath, records.join('\n') + '\n');

      const refDate = new Date('2026-11-03T20:00:00.000Z');
      const result = await aggregateUsageFromRecordings(tempDir, 10, refDate);

      expect(result.longestStreak).toBe(4);
      expect(result.currentStreak).toBe(2);
      expect(result.totalWindowTokens).toBe(200);
      expect(result.totalWindowSessions).toBe(1);
      expect(result.totalWindowTurns).toBe(3);
    });
  });
});
