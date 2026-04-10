/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Non-blocking session logger that persists every turn to a
 * daily JSONL file under ~/.gemini/logs/. Implements buffered writes,
 * automatic log rotation (30-day default), and graceful shutdown.
 *
 * Inspired by the append-only daily log pattern in the reference codebase
 * but reimplemented from scratch for Gemini's architecture.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';
import {
  type SessionLogEntry,
  type SessionLoggerConfig,
  DEFAULT_SESSION_LOGGER_CONFIG,
  MAX_PROMPT_LENGTH,
  LOG_FILE_PATTERN,
} from './sessionLogTypes.js';

/**
 * Formats a Date into the YYYY-MM-DD string used for log file names.
 */
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * SessionLogger writes turn-level entries to daily JSONL files.
 *
 * Writes are buffered and flushed asynchronously so they never block the
 * main CLI event loop. The logger is designed to be instantiated once at
 * startup and shared via the config or a module-level singleton.
 */
export class SessionLogger {
  private readonly logDir: string;
  private readonly retentionDays: number;
  private readonly flushThreshold: number;
  private buffer: SessionLogEntry[] = [];
  private flushInProgress = false;
  private flushPromise: Promise<void> | null = null;

  constructor(config: SessionLoggerConfig) {
    this.logDir = config.logDir;
    this.retentionDays = config.retentionDays;
    this.flushThreshold = config.flushThreshold;
  }

  /**
   * Creates a SessionLogger with sensible defaults.
   * @param logDir The directory for log files (typically ~/.gemini/logs).
   */
  static create(logDir: string): SessionLogger {
    return new SessionLogger({
      logDir,
      ...DEFAULT_SESSION_LOGGER_CONFIG,
    });
  }

  /**
   * Enqueues a log entry. If the buffer exceeds the flush threshold,
   * an asynchronous flush is triggered (fire-and-forget).
   */
  logEntry(entry: SessionLogEntry): void {
    const sanitized: SessionLogEntry = {
      ...entry,
      prompt: entry.prompt.slice(0, MAX_PROMPT_LENGTH),
    };
    this.buffer.push(sanitized);

    if (this.buffer.length >= this.flushThreshold) {
      this.flushPromise = this.flush();
      void this.flushPromise;
    }
  }

  /**
   * Convenience method to create and log an entry in one call.
   */
  log(
    sessionId: string,
    prompt: string,
    summary: string,
    filesModified: string[],
    durationMs: number,
  ): void {
    this.logEntry({
      timestamp: new Date().toISOString(),
      sessionId,
      prompt,
      summary,
      filesModified,
      durationMs,
    });
  }

  /**
   * Flushes all buffered entries to disk. Safe to call multiple times
   * concurrently — only one flush runs at a time.
   */
  async flush(): Promise<void> {
    if (this.flushInProgress || this.buffer.length === 0) {
      return;
    }

    this.flushInProgress = true;
    const entries = this.buffer;
    this.buffer = [];

    try {
      await fs.mkdir(this.logDir, { recursive: true });

      // Group entries by date for correct file targeting
      const grouped = new Map<string, SessionLogEntry[]>();
      for (const entry of entries) {
        const dateKey = formatDateKey(new Date(entry.timestamp));
        const group = grouped.get(dateKey);
        if (group) {
          group.push(entry);
        } else {
          grouped.set(dateKey, [entry]);
        }
      }

      // Write each date group to its corresponding file
      const writePromises: Array<Promise<void>> = [];
      for (const [dateKey, dateEntries] of grouped) {
        const filePath = path.join(this.logDir, `${dateKey}.jsonl`);
        const lines =
          dateEntries.map((e) => JSON.stringify(e)).join('\n') + '\n';
        writePromises.push(
          fs.appendFile(filePath, lines, { encoding: 'utf-8' }),
        );
      }

      await Promise.all(writePromises);
    } catch (error) {
      debugLogger.warn(
        `[SessionLogger] Failed to flush: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Re-add failed entries to the front of the buffer for retry
      this.buffer.unshift(...entries);
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * Ensures all pending entries are written to disk. Call during
   * graceful shutdown to prevent data loss.
   */
  async shutdown(): Promise<void> {
    // Wait for any in-progress flush
    if (this.flushPromise) {
      await this.flushPromise;
    }
    // Flush remaining entries
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }

  /**
   * Removes log files older than the configured retention period.
   * Designed to be called fire-and-forget during startup.
   */
  async rotateOldLogs(): Promise<number> {
    let deletedCount = 0;
    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      const cutoffStr = formatDateKey(cutoffDate);

      const deletePromises: Array<Promise<void>> = [];
      for (const file of files) {
        if (!LOG_FILE_PATTERN.test(file)) continue;

        const dateStr = file.replace('.jsonl', '');
        if (dateStr < cutoffStr) {
          deletePromises.push(
            fs.unlink(path.join(this.logDir, file)).then(() => {
              deletedCount++;
            }),
          );
        }
      }

      await Promise.all(deletePromises);

      if (deletedCount > 0) {
        debugLogger.debug(
          `[SessionLogger] Rotated ${deletedCount} old log file(s)`,
        );
      }
    } catch (error) {
      // Log dir may not exist yet — that's fine
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        )
      ) {
        debugLogger.warn(
          `[SessionLogger] Rotation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return deletedCount;
  }

  /**
   * Reads all entries from the last N days. Used by the memory
   * consolidation system to gather recent session context.
   */
  async readRecentEntries(days: number = 7): Promise<SessionLogEntry[]> {
    const entries: SessionLogEntry[] = [];
    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = formatDateKey(cutoffDate);

      const relevantFiles = files
        .filter((f) => LOG_FILE_PATTERN.test(f))
        .filter((f) => f.replace('.jsonl', '') >= cutoffStr)
        .sort();

      for (const file of relevantFiles) {
        const content = await fs.readFile(
          path.join(this.logDir, file),
          'utf-8',
        );
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed: unknown = JSON.parse(line);
            if (isSessionLogEntry(parsed)) {
              entries.push(parsed);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Log dir may not exist yet
    }
    return entries;
  }

  /** Returns the log directory path for external use. */
  getLogDir(): string {
    return this.logDir;
  }
}

/** Type guard for SessionLogEntry. */
function isSessionLogEntry(value: unknown): value is SessionLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const v = value as {
    timestamp: unknown;
    sessionId: unknown;
    prompt: unknown;
    summary: unknown;
    filesModified: unknown;
    durationMs: unknown;
  };
  return (
    typeof v.timestamp === 'string' &&
    typeof v.sessionId === 'string' &&
    typeof v.prompt === 'string' &&
    typeof v.summary === 'string' &&
    Array.isArray(v.filesModified) &&
    typeof v.durationMs === 'number'
  );
}
