/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  ShellExecutionService,
  debugLogger,
  getErrorReportsDir,
} from '@google/gemini-cli-core';

const RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Deletes files older than 7 days in the directory returned by `getDir`,
 * limited to names accepted by `shouldClean`.
 * Best effort: failures are only logged in debug mode.
 */
async function deleteExpiredFiles(
  getDir: () => string,
  shouldClean: (fileName: string) => boolean,
  label: string,
  debugMode: boolean,
): Promise<void> {
  try {
    const dir = getDir();

    // Check if the directory exists
    try {
      await fs.access(dir);
    } catch {
      // Directory doesn't exist, nothing to clean up
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const now = Date.now();
    let deletedCount = 0;

    for (const entry of entries) {
      if (entry.isFile() && shouldClean(entry.name)) {
        const filePath = path.join(dir, entry.name);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtime.getTime() > RETENTION_PERIOD_MS) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (error) {
          if (debugMode) {
            debugLogger.debug(
              `Failed to process ${label} ${entry.name}:`,
              error,
            );
          }
        }
      }
    }

    if (deletedCount > 0 && debugMode) {
      debugLogger.debug(`Cleaned up ${deletedCount} expired ${label}s.`);
    }
  } catch (error) {
    // Best-effort cleanup, don't let it crash the CLI
    if (debugMode) {
      debugLogger.warn(`Cleanup of ${label}s failed:`, error);
    }
  }
}

/**
 * Cleans up background process log files older than 7 days.
 * Scans ~/.gemini/tmp/background-processes/ for .log files.
 *
 * @param debugMode Whether to log detailed debug information.
 */
export async function cleanupBackgroundLogs(
  debugMode: boolean = false,
): Promise<void> {
  await deleteExpiredFiles(
    () => ShellExecutionService.getLogDir(),
    (name) => name.endsWith('.log'),
    'background log',
    debugMode,
  );
}

/**
 * Cleans up error reports older than 7 days.
 * Scans ~/.gemini/tmp/error-reports/ for gemini-client-error-*.json files.
 *
 * @param debugMode Whether to log detailed debug information.
 */
export async function cleanupErrorReports(
  debugMode: boolean = false,
): Promise<void> {
  await deleteExpiredFiles(
    getErrorReportsDir,
    (name) => name.startsWith('gemini-client-error-') && name.endsWith('.json'),
    'error report',
    debugMode,
  );
}
