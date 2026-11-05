/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

export const DEFAULT_HEATMAP_WINDOW_DAYS = 196;
export const INVALID_HEATMAP_DATE_ERROR =
  "Invalid date format. Expected YYYY-MM-DD, 'today', or 'yesterday'.";

const MS_PER_UTC_DAY = 86_400_000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DailyUsageSummary {
  date: string; // YYYY-MM-DD (system local calendar date)
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  turns: number;
  sessions: number;
  modelBreakdown: Record<string, number>;
}

export interface HeatmapDataset {
  dailyUsage: Map<string, DailyUsageSummary>;
  totalWindowTokens: number;
  totalWindowSessions: number;
  totalWindowTurns: number;
  currentStreak: number;
  longestStreak: number;
}

export type ResolvedHeatmapDateResult =
  | { ok: true; date?: string }
  | { ok: false; error: string };

interface RawTokenFields {
  input?: unknown;
  output?: unknown;
  cached?: unknown;
  thoughts?: unknown;
  tool?: unknown;
  total?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  cachedTokens?: unknown;
  totalTokens?: unknown;
}

interface RawRecordFields {
  id?: unknown;
  sessionId?: unknown;
  timestamp?: unknown;
  model?: unknown;
  tokens?: unknown;
  tokensSummary?: unknown;
  messages?: unknown;
  $set?: unknown;
}

interface PluckedTurnUsage {
  dateKey: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  model?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  return 0;
}

function toExplicitTotal(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  return undefined;
}

/**
 * Formats a Date instance into a system-local YYYY-MM-DD date key.
 */
export function formatLocalDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses and validates a strict YYYY-MM-DD calendar date key into UTC midnight
 * milliseconds. Rejects out-of-range calendar dates such as 2026-02-31.
 */
export function parseDateKeyToUtcMs(dateKey: string): number | null {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return utcMs;
}

function formatUtcMsAsDateKey(utcMs: number): string {
  const d = new Date(utcMs);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds or subtracts whole calendar days from a validated YYYY-MM-DD key using
 * UTC calendar arithmetic so Daylight Saving Time transitions never drift.
 */
export function addCalendarDays(dateKey: string, deltaDays: number): string {
  const utcMs = parseDateKeyToUtcMs(dateKey);
  if (utcMs === null) {
    return dateKey;
  }
  return formatUtcMsAsDateKey(utcMs + deltaDays * MS_PER_UTC_DAY);
}

/**
 * Computes exact whole-day distance (`endDateKey - startDateKey`) between two
 * validated YYYY-MM-DD keys without DST drift.
 */
export function diffCalendarDays(
  startDateKey: string,
  endDateKey: string,
): number | null {
  const startMs = parseDateKeyToUtcMs(startDateKey);
  const endMs = parseDateKeyToUtcMs(endDateKey);
  if (startMs === null || endMs === null) {
    return null;
  }
  return Math.round((endMs - startMs) / MS_PER_UTC_DAY);
}

/**
 * Validates and resolves optional `/stats heatmap [today|yesterday|YYYY-MM-DD]`
 * arguments without touching filesystem paths.
 */
export function resolveHeatmapDateArg(
  rawArg: string,
  referenceDate: Date = new Date(),
): ResolvedHeatmapDateResult {
  const trimmed = rawArg.trim();
  if (!trimmed) {
    return { ok: true, date: undefined };
  }

  const normalized = trimmed.toLowerCase();
  const todayKey = formatLocalDateKey(referenceDate);

  if (normalized === 'today') {
    return { ok: true, date: todayKey };
  }
  if (normalized === 'yesterday') {
    return { ok: true, date: addCalendarDays(todayKey, -1) };
  }

  if (parseDateKeyToUtcMs(trimmed) !== null) {
    return { ok: true, date: trimmed };
  }

  return { ok: false, error: INVALID_HEATMAP_DATE_ERROR };
}

function extractPluckedTurn(
  item: unknown,
  nextAnonKey: () => string,
): { key: string; usage: PluckedTurnUsage } | null {
  if (!isPlainRecord(item)) {
    return null;
  }

  const fields: RawRecordFields = item;
  if (typeof fields.timestamp !== 'string' || !fields.timestamp.trim()) {
    return null;
  }

  const parsedTimestamp = new Date(fields.timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return null;
  }

  const rawTokensRecord = isPlainRecord(fields.tokens)
    ? fields.tokens
    : isPlainRecord(fields.tokensSummary)
      ? fields.tokensSummary
      : null;
  if (!rawTokensRecord) {
    return null;
  }

  const tokenFields: RawTokenFields = rawTokensRecord;
  const inputTokens = toNonNegativeNumber(
    tokenFields.input ?? tokenFields.inputTokens,
  );
  const outputTokens = toNonNegativeNumber(
    tokenFields.output ?? tokenFields.outputTokens,
  );
  const cachedTokens = toNonNegativeNumber(
    tokenFields.cached ?? tokenFields.cachedTokens,
  );
  const thoughtsTokens = toNonNegativeNumber(tokenFields.thoughts);
  const toolTokens = toNonNegativeNumber(tokenFields.tool);
  const explicitTotal =
    toExplicitTotal(tokenFields.total) ??
    toExplicitTotal(tokenFields.totalTokens);
  const totalTokens =
    explicitTotal ?? inputTokens + outputTokens + thoughtsTokens + toolTokens;

  const model =
    typeof fields.model === 'string' && fields.model.trim().length > 0
      ? fields.model.trim()
      : undefined;

  const key =
    typeof fields.id === 'string' && fields.id.length > 0
      ? fields.id
      : nextAnonKey();

  return {
    key,
    usage: {
      dateKey: formatLocalDateKey(parsedTimestamp),
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens,
      model,
    },
  };
}

async function listJsonlRecordingFiles(chatsDir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(chatsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jsonlFiles: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      jsonlFiles.push(path.join(chatsDir, entry.name));
    } else if (entry.isDirectory()) {
      // Subagent recordings live one directory level under chats/<parentSessionId>/*.jsonl.
      const subDir = path.join(chatsDir, entry.name);
      try {
        const subEntries = await fs.promises.readdir(subDir, {
          withFileTypes: true,
        });
        for (const subEntry of subEntries) {
          if (subEntry.isFile() && subEntry.name.endsWith('.jsonl')) {
            jsonlFiles.push(path.join(subDir, subEntry.name));
          }
        }
      } catch {
        // Ignore unreadable subdirectories gracefully.
      }
    }
  }

  jsonlFiles.sort();
  return jsonlFiles;
}

async function collectFileTurnUsages(filePath: string): Promise<{
  sessionKey: string;
  turns: Iterable<PluckedTurnUsage>;
}> {
  const perFileTurns = new Map<string, PluckedTurnUsage>();
  let detectedSessionId: string | undefined;
  let anonCounter = 0;
  const nextAnonKey = () => `__anon_${anonCounter++}`;

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isPlainRecord(parsed)) {
          continue;
        }

        const fields: RawRecordFields = parsed;
        if (
          typeof fields.sessionId === 'string' &&
          fields.sessionId.trim().length > 0
        ) {
          detectedSessionId = fields.sessionId.trim();
        }

        if (isPlainRecord(fields.$set)) {
          const setFields: RawRecordFields = fields.$set;
          if (
            typeof setFields.sessionId === 'string' &&
            setFields.sessionId.trim().length > 0
          ) {
            detectedSessionId = setFields.sessionId.trim();
          }
          if (Array.isArray(setFields.messages)) {
            for (const msg of setFields.messages) {
              const extracted = extractPluckedTurn(msg, nextAnonKey);
              if (extracted) {
                perFileTurns.set(extracted.key, extracted.usage);
              }
            }
          }
          continue;
        }

        if (Array.isArray(fields.messages)) {
          for (const msg of fields.messages) {
            const extracted = extractPluckedTurn(msg, nextAnonKey);
            if (extracted) {
              perFileTurns.set(extracted.key, extracted.usage);
            }
          }
          continue;
        }

        const extracted = extractPluckedTurn(parsed, nextAnonKey);
        if (extracted) {
          perFileTurns.set(extracted.key, extracted.usage);
        }
      } catch {
        // Skip corrupt or incomplete JSONL lines gracefully.
        continue;
      }
    }
  } catch {
    // Ignore per-file stream errors so remaining session logs still aggregate.
  } finally {
    rl.close();
    fileStream.destroy();
  }

  return {
    sessionKey: detectedSessionId ?? filePath,
    turns: perFileTurns.values(),
  };
}

function computeHeatmapMetrics(
  usageMap: Map<string, DailyUsageSummary>,
  sessionsByDate: ReadonlyMap<string, ReadonlySet<string>>,
  windowDays: number,
  referenceDate: Date,
): HeatmapDataset {
  const activeDates = Array.from(usageMap.entries())
    .filter(([, summary]) => summary.totalTokens > 0)
    .map(([dateKey]) => dateKey)
    .sort();

  let longestStreak = 0;
  let runningStreak = 0;
  let prevDateKey: string | null = null;

  for (const dateKey of activeDates) {
    if (prevDateKey !== null && diffCalendarDays(prevDateKey, dateKey) === 1) {
      runningStreak += 1;
    } else {
      runningStreak = 1;
    }
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    prevDateKey = dateKey;
  }

  const todayKey = formatLocalDateKey(referenceDate);
  const yesterdayKey = addCalendarDays(todayKey, -1);
  const hasUsageOnDate = (key: string) =>
    (usageMap.get(key)?.totalTokens ?? 0) > 0;

  let currentStreak = 0;
  let cursorKey: string | null = hasUsageOnDate(todayKey)
    ? todayKey
    : hasUsageOnDate(yesterdayKey)
      ? yesterdayKey
      : null;

  while (cursorKey !== null && hasUsageOnDate(cursorKey)) {
    currentStreak += 1;
    cursorKey = addCalendarDays(cursorKey, -1);
  }

  let totalWindowTokens = 0;
  let totalWindowTurns = 0;
  const windowSessions = new Set<string>();
  if (windowDays > 0) {
    const cutoffKey = addCalendarDays(todayKey, -(windowDays - 1));
    for (const [dateKey, summary] of usageMap.entries()) {
      if (dateKey >= cutoffKey && dateKey <= todayKey) {
        totalWindowTokens += summary.totalTokens;
        totalWindowTurns += summary.turns;
        const dateSessions = sessionsByDate.get(dateKey);
        if (dateSessions) {
          for (const sessionKey of dateSessions) {
            windowSessions.add(sessionKey);
          }
        }
      }
    }
  }

  return {
    dailyUsage: usageMap,
    totalWindowTokens,
    totalWindowSessions: windowSessions.size,
    totalWindowTurns,
    currentStreak,
    longestStreak,
  };
}

/**
 * Streams `.jsonl` chat recordings under `chatsDir` asynchronously to compute
 * daily token usage summaries, rolling window totals, and usage streaks.
 */
export async function aggregateUsageFromRecordings(
  chatsDir: string,
  windowDays = DEFAULT_HEATMAP_WINDOW_DAYS,
  referenceDate: Date = new Date(),
): Promise<HeatmapDataset> {
  const usageMap = new Map<string, DailyUsageSummary>();
  if (!chatsDir.trim()) {
    return {
      dailyUsage: usageMap,
      totalWindowTokens: 0,
      totalWindowSessions: 0,
      totalWindowTurns: 0,
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  const files = await listJsonlRecordingFiles(chatsDir);
  const sessionsByDate = new Map<string, Set<string>>();

  for (const filePath of files) {
    const { sessionKey, turns } = await collectFileTurnUsages(filePath);
    for (const turn of turns) {
      const entry = usageMap.get(turn.dateKey) ?? {
        date: turn.dateKey,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        turns: 0,
        sessions: 0,
        modelBreakdown: {},
      };

      entry.inputTokens += turn.inputTokens;
      entry.outputTokens += turn.outputTokens;
      entry.cachedTokens += turn.cachedTokens;
      entry.totalTokens += turn.totalTokens;
      entry.turns += 1;

      if (turn.model) {
        entry.modelBreakdown[turn.model] =
          (entry.modelBreakdown[turn.model] ?? 0) + turn.totalTokens;
      }

      let dateSessions = sessionsByDate.get(turn.dateKey);
      if (!dateSessions) {
        dateSessions = new Set<string>();
        sessionsByDate.set(turn.dateKey, dateSessions);
      }
      dateSessions.add(sessionKey);
      entry.sessions = dateSessions.size;

      usageMap.set(turn.dateKey, entry);
    }
  }

  return computeHeatmapMetrics(
    usageMap,
    sessionsByDate,
    windowDays,
    referenceDate,
  );
}
