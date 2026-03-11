/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ShellExecutionService, debugLogger } from '@google/gemini-cli-core';

const RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cleans up background process log files older than 7 days.
 * Scans ~/.gemini/tmp/background-processes/ for .log files.
 *
 * @param debugMode Whether to log detailed debug information.
 */
export async function cleanupBackgroundLogs(
  debugMode: boolean = false,
): Promise<void> {
  try {
    const logDir = ShellExecutionService.getLogDir();

    // Check if the directory exists
    try {
      await fs.access(logDir);
    } catch {
      // Directory doesn't exist, nothing to clean up
      return;
    }

    const entries = await fs.readdir(logDir, { withFileTypes: true });
    const now = Date.now();
    let deletedCount = 0;

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.log')) {
        const filePath = path.join(logDir, entry.name);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtime.getTime() > RETENTION_PERIOD_MS) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (error) {
          if (debugMode) {
            debugLogger.debug(
              `Failed to process log file ${entry.name}:`,
              error,
            );
          }
        }
      }
    }

    if (deletedCount > 0 && debugMode) {
      debugLogger.debug(`Cleaned up ${deletedCount} expired background logs.`);
    }
  } catch (error) {
    // Best-effort cleanup, don't let it crash the CLI
    if (debugMode) {
      debugLogger.warn('Background log cleanup failed:', error);
    }
  }
}
