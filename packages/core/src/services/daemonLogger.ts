/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Logger for daemon actions. Writes every action to a daily log
 * file and maintains the last 30 days of logs.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';

/** Number of days to retain logs. */
const LOG_RETENTION_DAYS = 30;

/** Format for log file names. */
const LOG_FILE_PATTERN = /^daemon-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export interface DaemonLogEntry {
  type: string;
  timestamp: string;
  details: Record<string, unknown>;
}

/**
 * Logger that writes daemon actions to daily JSONL files with automatic rotation.
 */
export class DaemonLogger {
  private readonly logDir: string;

  constructor(configDir: string) {
    this.logDir = path.join(configDir, 'daemon-logs');
  }

  /**
   * Logs an entry to today's log file.
   */
  async log(entry: DaemonLogEntry): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });

      const today = this.getDateKey(new Date());
      const logPath = path.join(this.logDir, `daemon-${today}.jsonl`);

      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(logPath, line, 'utf-8');

      // Run rotation occasionally (not on every write)
      if (Math.random() < 0.01) {
        void this.rotateOldLogs().catch((e) => {
          debugLogger.warn('[DaemonLogger] Rotation failed:', e);
        });
      }
    } catch (error) {
      debugLogger.error('[DaemonLogger] Failed to log entry:', error);
    }
  }

  /**
   * Reads all log entries from the specified number of days.
   */
  async readLog(days: number = 30): Promise<DaemonLogEntry[]> {
    const entries: DaemonLogEntry[] = [];

    try {
      await fs.mkdir(this.logDir, { recursive: true });

      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffKey = this.getDateKey(cutoffDate);

      const relevantFiles = files
        .filter((f) => LOG_FILE_PATTERN.test(f))
        .filter((f) => {
          const match = f.match(LOG_FILE_PATTERN);
          if (match && match[1]) {
            return match[1] >= cutoffKey;
          }
          return false;
        })
        .sort()
        .reverse(); // Most recent first

      for (const file of relevantFiles) {
        const content = await fs.readFile(path.join(this.logDir, file), 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed: unknown = JSON.parse(line);
            if (this.isDaemonLogEntry(parsed)) {
              entries.push(parsed);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      debugLogger.error('[DaemonLogger] Failed to read log:', error);
    }

    return entries;
  }

  /**
   * Gets actions from today's log only.
   */
  async getTodayActions(): Promise<DaemonLogEntry[]> {
    const today = this.getDateKey(new Date());
    const logPath = path.join(this.logDir, `daemon-${today}.jsonl`);
    const entries: DaemonLogEntry[] = [];

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed: unknown = JSON.parse(line);
          if (this.isDaemonLogEntry(parsed)) {
            entries.push(parsed);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File doesn't exist yet
    }

    return entries;
  }

  /**
   * Clears all log files.
   */
  async clearLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      for (const file of files) {
        if (LOG_FILE_PATTERN.test(file)) {
          await fs.unlink(path.join(this.logDir, file));
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // --- Private methods ---

  private getDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private isDaemonLogEntry(value: unknown): value is DaemonLogEntry {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj['type'] === 'string' &&
      typeof obj['timestamp'] === 'string' &&
      typeof obj['details'] === 'object'
    );
  }

  private async rotateOldLogs(): Promise<number> {
    let deletedCount = 0;

    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);
      const cutoffKey = this.getDateKey(cutoffDate);

      for (const file of files) {
        if (!LOG_FILE_PATTERN.test(file)) continue;

        const match = file.match(LOG_FILE_PATTERN);
        if (match && match[1] && match[1] < cutoffKey) {
          await fs.unlink(path.join(this.logDir, file));
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        debugLogger.debug(`[DaemonLogger] Rotated ${deletedCount} old log file(s)`);
      }
    } catch (error) {
      debugLogger.warn('[DaemonLogger] Rotation failed:', error);
    }

    return deletedCount;
  }
}