/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir, GEMINI_DIR } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { SessionLogEntry, SessionLogFile } from './types.js';

const LOGS_DIR_NAME = 'session-logs';
const LOGS_MAX_DAYS = 30;

const logger = {
  debug: (...args: unknown[]) =>
    debugLogger.debug('[DEBUG] [SessionLog]', ...args),
  warn: (...args: unknown[]) =>
    debugLogger.warn('[WARN] [SessionLog]', ...args),
  error: (...args: unknown[]) =>
    debugLogger.error('[ERROR] [SessionLog]', ...args),
};

/**
 * Get the path to the session logs directory.
 */
export function getSessionLogsDir(): string {
  return path.join(homedir(), GEMINI_DIR, LOGS_DIR_NAME);
}

/**
 * Get the path to today's session log file.
 */
export function getSessionLogPath(date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  return path.join(getSessionLogsDir(), `${dateStr}.jsonl`);
}

/**
 * Ensure the session logs directory exists.
 */
export async function ensureSessionLogsDirExists(): Promise<void> {
  const logsDir = getSessionLogsDir();
  try {
    await fs.mkdir(logsDir, { recursive: true });
    logger.debug('Created session logs directory:', logsDir);
  } catch (e: unknown) {
    const code =
      e instanceof Error && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
    logger.error(`Failed to create session logs directory: ${code ?? String(e)}`);
  }
}

/**
 * Rotate session logs by removing files older than LOGS_MAX_DAYS.
 */
export async function rotateSessionLogs(): Promise<void> {
  const logsDir = getSessionLogsDir();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - LOGS_MAX_DAYS);

  try {
    const entries = await fs.readdir(logsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;

      const match = entry.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!match) continue;

      const fileDate = new Date(match[1]);
      if (fileDate < cutoffDate) {
        await fs.unlink(path.join(logsDir, entry));
        logger.debug('Removed old session log:', entry);
      }
    }
  } catch (e: unknown) {
    const code =
      e instanceof Error && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== 'ENOENT') {
      logger.error(`Failed to rotate session logs: ${code ?? String(e)}`);
    }
  }
}

/**
 * Append a session log entry to today's log file.
 */
export async function appendSessionLog(entry: SessionLogEntry): Promise<void> {
  await ensureSessionLogsDirExists();

  const logPath = getSessionLogPath();
  const line = JSON.stringify(entry) + '\n';

  try {
    await fs.appendFile(logPath, line, 'utf-8');
    logger.debug('Appended session log entry');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to append session log: ${message}`);
  }

  // Rotate logs in the background (don't await)
  void rotateSessionLogs();
}

/**
 * Read all entries from a session log file.
 */
export async function readSessionLog(date: Date): Promise<SessionLogEntry[]> {
  const logPath = getSessionLogPath(date);
  const entries: SessionLogEntry[] = [];

  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          entries.push(JSON.parse(line) as SessionLogEntry);
        } catch {
          // Skip malformed lines
        }
      }
    }
  } catch (e: unknown) {
    const code =
      e instanceof Error && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== 'ENOENT') {
      logger.error(`Failed to read session log: ${code ?? String(e)}`);
    }
  }

  return entries;
}

/**
 * Read all session log files within a date range.
 */
export async function readSessionLogsInRange(
  startDate: Date,
  endDate: Date,
): Promise<SessionLogFile[]> {
  const logs: SessionLogFile[] = [];
  const logsDir = getSessionLogsDir();

  try {
    const entries = await fs.readdir(logsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;

      const match = entry.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!match) continue;

      const fileDate = new Date(match[1]);
      if (fileDate >= startDate && fileDate <= endDate) {
        const logEntries = await readSessionLog(fileDate);
        logs.push({
          date: match[1],
          entries: logEntries,
        });
      }
    }
  } catch (e: unknown) {
    const code =
      e instanceof Error && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== 'ENOENT') {
      logger.error(`Failed to read session logs: ${code ?? String(e)}`);
    }
  }

  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get recent session logs (last N days).
 */
export async function getRecentSessionLogs(days: number = 7): Promise<SessionLogFile[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return readSessionLogsInRange(startDate, endDate);
}

/**
 * Create a summary of session log entries for consolidation.
 * This extracts key information for memory consolidation.
 */
export function summarizeSessionLogs(logs: SessionLogFile[]): string {
  const summaries: string[] = [];

  for (const log of logs) {
    for (const entry of log.entries) {
      if (entry.summary) {
        summaries.push(`[${entry.timestamp}] ${entry.summary}`);
      }
    }
  }

  return summaries.join('\n');
}