/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  debugLogger,
  sanitizeFilenamePart,
  Storage,
  TOOL_OUTPUTS_DIR,
  type Config,
} from '@google/gemini-cli-core';
import type { Settings, SessionRetentionSettings } from '../config/settings.js';
import { getAllSessionFiles, type SessionFileEntry } from './sessionUtils.js';

// Constants
export const DEFAULT_MIN_RETENTION = '1d' as string;
const MIN_MAX_COUNT = 1;
const MULTIPLIERS = {
  h: 60 * 60 * 1000, // hours to ms
  d: 24 * 60 * 60 * 1000, // days to ms
  w: 7 * 24 * 60 * 60 * 1000, // weeks to ms
  m: 30 * 24 * 60 * 60 * 1000, // months (30 days) to ms
};

/**
 * Result of session cleanup operation
 */
export interface CleanupResult {
  disabled: boolean;
  scanned: number;
  deleted: number;
  skipped: number;
  failed: number;
}

/**
 * Main entry point for session cleanup during CLI startup
 */
export async function cleanupExpiredSessions(
  config: Config,
  settings: Settings,
): Promise<CleanupResult> {
  const result: CleanupResult = {
    disabled: false,
    scanned: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // Early exit if cleanup is disabled
    if (!settings.general?.sessionRetention?.enabled) {
      return { ...result, disabled: true };
    }

    const retentionConfig = settings.general.sessionRetention;
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

    // Validate retention configuration
    const validationErrorMessage = validateRetentionConfig(
      config,
      retentionConfig,
    );
    if (validationErrorMessage) {
      // Log validation errors to console for visibility
      debugLogger.warn(`Session cleanup disabled: ${validationErrorMessage}`);
      return { ...result, disabled: true };
    }

    // Get all session files (including corrupted ones) for this project
    const allFiles = await getAllSessionFiles(chatsDir, config.getSessionId());
    result.scanned = allFiles.length;

    if (allFiles.length === 0) {
      return result;
    }

    // Determine which sessions to delete (corrupted and expired)
    const sessionsToDelete = await identifySessionsToDelete(
      allFiles,
      retentionConfig,
    );

    // Delete all sessions that need to be deleted
    for (const sessionToDelete of sessionsToDelete) {
      try {
        const sessionPath = path.join(chatsDir, sessionToDelete.fileName);
        await fs.unlink(sessionPath);

        // ALSO cleanup Activity logs in the project logs directory
        const sessionId = sessionToDelete.sessionInfo?.id;
        if (sessionId) {
          const logsDir = path.join(config.storage.getProjectTempDir(), 'logs');
          const logPath = path.join(logsDir, `session-${sessionId}.jsonl`);
          try {
            await fs.unlink(logPath);
          } catch {
            /* ignore if log doesn't exist */
          }

          // ALSO cleanup tool outputs for this session
          const safeSessionId = sanitizeFilenamePart(sessionId);
          const toolOutputDir = path.join(
            config.storage.getProjectTempDir(),
            TOOL_OUTPUTS_DIR,
            `session-${safeSessionId}`,
          );
          try {
            await fs.rm(toolOutputDir, { recursive: true, force: true });
          } catch {
            /* ignore if doesn't exist */
          }
        }

        if (config.getDebugMode()) {
          if (sessionToDelete.sessionInfo === null) {
            debugLogger.debug(
              `Deleted corrupted session file: ${sessionToDelete.fileName}`,
            );
          } else {
            debugLogger.debug(
              `Deleted expired session: ${sessionToDelete.sessionInfo.id} (${sessionToDelete.sessionInfo.lastUpdated})`,
            );
          }
        }
        result.deleted++;
      } catch (error) {
        // Ignore ENOENT errors (file already deleted)
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          // File already deleted, do nothing.
        } else {
          // Log error directly to console
          const sessionId =
            sessionToDelete.sessionInfo === null
              ? sessionToDelete.fileName
              : sessionToDelete.sessionInfo.id;
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          debugLogger.warn(
            `Failed to delete session ${sessionId}: ${errorMessage}`,
          );
          result.failed++;
        }
      }
    }

    result.skipped = result.scanned - result.deleted - result.failed;

    if (config.getDebugMode() && result.deleted > 0) {
      debugLogger.debug(
        `Session cleanup: deleted ${result.deleted}, skipped ${result.skipped}, failed ${result.failed}`,
      );
    }
  } catch (error) {
    // Global error handler - don't let cleanup failures break startup
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    debugLogger.warn(`Session cleanup failed: ${errorMessage}`);
    result.failed++;
  }

  return result;
}

/**
 * Identifies sessions that should be deleted (corrupted or expired based on retention policy)
 */
async function identifySessionsToDelete(
  allFiles: SessionFileEntry[],
  retentionConfig: SessionRetentionSettings,
): Promise<SessionFileEntry[]> {
  const sessionsToDelete: SessionFileEntry[] = [];

  // All corrupted files should be deleted
  sessionsToDelete.push(
    ...allFiles.filter((entry) => entry.sessionInfo === null),
  );

  // Now handle valid sessions based on retention policy
  const validSessions = allFiles.filter((entry) => entry.sessionInfo !== null);
  if (validSessions.length === 0) {
    return sessionsToDelete;
  }

  const now = new Date();

  // Calculate cutoff date for age-based retention
  let cutoffDate: Date | null = null;
  if (retentionConfig.maxAge) {
    try {
      const maxAgeMs = parseRetentionPeriod(retentionConfig.maxAge);
      cutoffDate = new Date(now.getTime() - maxAgeMs);
    } catch {
      // This should not happen as validation should have caught it,
      // but handle gracefully just in case
      cutoffDate = null;
    }
  }

  // Sort valid sessions by lastUpdated (newest first) for count-based retention
  const sortedValidSessions = [...validSessions].sort(
    (a, b) =>
      new Date(b.sessionInfo!.lastUpdated).getTime() -
      new Date(a.sessionInfo!.lastUpdated).getTime(),
  );

  // Separate deletable sessions from the active session
  const deletableSessions = sortedValidSessions.filter(
    (entry) => !entry.sessionInfo!.isCurrentSession,
  );

  // Calculate how many deletable sessions to keep (accounting for the active session)
  const hasActiveSession = sortedValidSessions.some(
    (e) => e.sessionInfo!.isCurrentSession,
  );
  const maxDeletableSessions =
    retentionConfig.maxCount && hasActiveSession
      ? Math.max(0, retentionConfig.maxCount - 1)
      : retentionConfig.maxCount;

  for (let i = 0; i < deletableSessions.length; i++) {
    const entry = deletableSessions[i];
    const session = entry.sessionInfo!;

    let shouldDelete = false;

    // Age-based retention check
    if (cutoffDate && new Date(session.lastUpdated) < cutoffDate) {
      shouldDelete = true;
    }

    // Count-based retention check (keep only N most recent deletable sessions)
    if (maxDeletableSessions !== undefined && i >= maxDeletableSessions) {
      shouldDelete = true;
    }

    if (shouldDelete) {
      sessionsToDelete.push(entry);
    }
  }

  return sessionsToDelete;
}

/**
 * Parses retention period strings like "30d", "7d", "24h" into milliseconds
 * @throws {Error} If the format is invalid
 */
function parseRetentionPeriod(period: string): number {
  const match = period.match(/^(\d+)([dhwm])$/);
  if (!match) {
    throw new Error(
      `Invalid retention period format: ${period}. Expected format: <number><unit> where unit is h, d, w, or m`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // Reject zero values as they're semantically invalid
  if (value === 0) {
    throw new Error(
      `Invalid retention period: ${period}. Value must be greater than 0`,
    );
  }

  return value * MULTIPLIERS[unit as keyof typeof MULTIPLIERS];
}

/**
 * Validates retention configuration
 */
function validateRetentionConfig(
  config: Config,
  retentionConfig: SessionRetentionSettings,
): string | null {
  if (!retentionConfig.enabled) {
    return 'Retention not enabled';
  }

  // Validate maxAge if provided
  if (retentionConfig.maxAge) {
    let maxAgeMs: number;
    try {
      maxAgeMs = parseRetentionPeriod(retentionConfig.maxAge);
    } catch (error) {
      return (error as Error | string).toString();
    }

    // Enforce minimum retention period
    const minRetention = retentionConfig.minRetention || DEFAULT_MIN_RETENTION;
    let minRetentionMs: number;
    try {
      minRetentionMs = parseRetentionPeriod(minRetention);
    } catch (error) {
      // If minRetention format is invalid, fall back to default
      if (config.getDebugMode()) {
        debugLogger.warn(`Failed to parse minRetention: ${error}`);
      }
      minRetentionMs = parseRetentionPeriod(DEFAULT_MIN_RETENTION);
    }

    if (maxAgeMs < minRetentionMs) {
      return `maxAge cannot be less than minRetention (${minRetention})`;
    }
  }

  // Validate maxCount if provided
  if (retentionConfig.maxCount !== undefined) {
    if (retentionConfig.maxCount < MIN_MAX_COUNT) {
      return `maxCount must be at least ${MIN_MAX_COUNT}`;
    }
  }

  // At least one retention method must be specified
  if (!retentionConfig.maxAge && retentionConfig.maxCount === undefined) {
    return 'Either maxAge or maxCount must be specified';
  }

  return null;
}

/**
 * Result of tool output cleanup operation
 */
export interface ToolOutputCleanupResult {
  disabled: boolean;
  scanned: number;
  deleted: number;
  failed: number;
}

/**
 * Cleans up tool output files based on age and count limits.
 * Uses the same retention settings as session cleanup.
 */
export async function cleanupToolOutputFiles(
  settings: Settings,
  debugMode: boolean = false,
  projectTempDir?: string,
): Promise<ToolOutputCleanupResult> {
  const result: ToolOutputCleanupResult = {
    disabled: false,
    scanned: 0,
    deleted: 0,
    failed: 0,
  };

  try {
    // Early exit if cleanup is disabled
    if (!settings.general?.sessionRetention?.enabled) {
      return { ...result, disabled: true };
    }

    const retentionConfig = settings.general.sessionRetention;
    let tempDir = projectTempDir;
    if (!tempDir) {
      const storage = new Storage(process.cwd());
      await storage.initialize();
      tempDir = storage.getProjectTempDir();
    }
    const toolOutputDir = path.join(tempDir, TOOL_OUTPUTS_DIR);

    // Check if directory exists
    try {
      await fs.access(toolOutputDir);
    } catch {
      // Directory doesn't exist, nothing to clean up
      return result;
    }

    // Get all entries in the tool-outputs directory
    const entries = await fs.readdir(toolOutputDir, { withFileTypes: true });
    result.scanned = entries.length;

    if (entries.length === 0) {
      return result;
    }

    const files = entries.filter((e) => e.isFile());

    // Get file stats for age-based cleanup (parallel for better performance)
    const fileStatsResults = await Promise.all(
      files.map(async (file) => {
        try {
          const filePath = path.join(toolOutputDir, file.name);
          const stat = await fs.stat(filePath);
          return { name: file.name, mtime: stat.mtime };
        } catch (error) {
          debugLogger.debug(
            `Failed to stat file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          return null;
        }
      }),
    );
    const fileStats = fileStatsResults.filter(
      (f): f is { name: string; mtime: Date } => f !== null,
    );

    // Sort by mtime (oldest first)
    fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    const now = new Date();
    const filesToDelete: string[] = [];

    // Age-based cleanup: delete files older than maxAge
    if (retentionConfig.maxAge) {
      try {
        const maxAgeMs = parseRetentionPeriod(retentionConfig.maxAge);
        const cutoffDate = new Date(now.getTime() - maxAgeMs);

        for (const file of fileStats) {
          if (file.mtime < cutoffDate) {
            filesToDelete.push(file.name);
          }
        }
      } catch (error) {
        debugLogger.debug(
          `Invalid maxAge format, skipping age-based cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Count-based cleanup: after age-based cleanup, if we still have more files
    // than maxCount, delete the oldest ones to bring the count down.
    // This ensures we keep at most maxCount files, preferring newer ones.
    if (retentionConfig.maxCount !== undefined) {
      // Filter out files already marked for deletion by age-based cleanup
      const remainingFiles = fileStats.filter(
        (f) => !filesToDelete.includes(f.name),
      );
      if (remainingFiles.length > retentionConfig.maxCount) {
        // Calculate how many excess files need to be deleted
        const excessCount = remainingFiles.length - retentionConfig.maxCount;
        // remainingFiles is already sorted oldest first, so delete from the start
        for (let i = 0; i < excessCount; i++) {
          filesToDelete.push(remainingFiles[i].name);
        }
      }
    }

    // For now, continue to cleanup individual files in the root tool-outputs dir
    // but also scan and cleanup expired session subdirectories.
    const subdirs = entries.filter(
      (e) => e.isDirectory() && e.name.startsWith('session-'),
    );
    for (const subdir of subdirs) {
      try {
        // Security: Validate that the subdirectory name is a safe filename part
        // and doesn't attempt path traversal.
        if (subdir.name !== sanitizeFilenamePart(subdir.name)) {
          debugLogger.debug(
            `Skipping unsafe tool-output subdirectory: ${subdir.name}`,
          );
          continue;
        }

        const subdirPath = path.join(toolOutputDir, subdir.name);
        const stat = await fs.stat(subdirPath);

        let shouldDelete = false;
        if (retentionConfig.maxAge) {
          const maxAgeMs = parseRetentionPeriod(retentionConfig.maxAge);
          const cutoffDate = new Date(now.getTime() - maxAgeMs);
          if (stat.mtime < cutoffDate) {
            shouldDelete = true;
          }
        }

        if (shouldDelete) {
          await fs.rm(subdirPath, { recursive: true, force: true });
          result.deleted++; // Count as one "unit" of deletion for stats
        }
      } catch (error) {
        debugLogger.debug(`Failed to cleanup subdir ${subdir.name}: ${error}`);
      }
    }

    // Delete the files
    for (const fileName of filesToDelete) {
      try {
        const filePath = path.join(toolOutputDir, fileName);
        await fs.unlink(filePath);
        result.deleted++;
      } catch (error) {
        debugLogger.debug(
          `Failed to delete file ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        result.failed++;
      }
    }

    if (debugMode && result.deleted > 0) {
      debugLogger.debug(
        `Tool output cleanup: deleted ${result.deleted}, failed ${result.failed}`,
      );
    }
  } catch (error) {
    // Global error handler - don't let cleanup failures break startup
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    debugLogger.warn(`Tool output cleanup failed: ${errorMessage}`);
    result.failed++;
  }

  return result;
}
