/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '@google/gemini-cli-core';
import { Settings, SessionRetentionSettings } from '../config/settings.js';
import { getSessionFiles, SessionInfo } from './sessionUtils.js';

/**
 * Result of session cleanup operation
 */
export interface CleanupResult {
  scanned: number;
  deleted: number;
  skipped: number;
  errors: Array<{ sessionId: string; error: string }>;
}

/**
 * Main entry point for session cleanup during CLI startup
 */
export async function cleanupExpiredSessions(
  config: Config,
  settings: Settings
): Promise<CleanupResult> {
  const result: CleanupResult = {
    scanned: 0,
    deleted: 0,
    errors: [],
    skipped: 0
  };

  try {
    // Early exit if cleanup is disabled
    if (!settings.sessionRetention?.enabled) {
      return result;
    }

    const retentionConfig = settings.sessionRetention;
    const chatsDir = path.join(config.getProjectTempDir(), 'chats');
    
    // Validate retention configuration
    const validationResult = validateRetentionConfig(retentionConfig);
    if (!validationResult.valid) {
      if (config.getDebugMode()) {
        console.debug(`Session cleanup disabled: ${validationResult.error}`);
      }
      return result;
    }

    // Get all session files for this project
    const sessionFiles = await getSessionFiles(chatsDir, config.getSessionId());
    result.scanned = sessionFiles.length;

    if (sessionFiles.length === 0) {
      return result;
    }

    // Determine which sessions to delete
    const sessionsToDelete = await identifyExpiredSessions(
      sessionFiles,
      retentionConfig,
      config.getSessionId()
    );

    // Perform cleanup
    for (const session of sessionsToDelete) {
      try {
        await safeDeleteSession(session, chatsDir, config.getDebugMode());
        result.deleted++;
      } catch (error) {
        result.errors.push({
          sessionId: session.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    result.skipped = result.scanned - result.deleted - result.errors.length;

    if (config.getDebugMode() && result.deleted > 0) {
      console.debug(
        `Session cleanup: deleted ${result.deleted}, skipped ${result.skipped}, errors ${result.errors.length}`
      );
    }

  } catch (error) {
    // Global error handler - don't let cleanup failures break startup
    if (config.getDebugMode()) {
      console.debug('Session cleanup failed:', error);
    }
    result.errors.push({
      sessionId: 'global',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return result;
}

/**
 * Identifies sessions that should be deleted based on retention policy
 */
async function identifyExpiredSessions(
  sessions: SessionInfo[],
  retentionConfig: SessionRetentionSettings,
  currentSessionId: string
): Promise<SessionInfo[]> {
  const now = new Date();
  const expiredSessions: SessionInfo[] = [];

  // Calculate cutoff date for age-based retention
  let cutoffDate: Date | null = null;
  if (retentionConfig.maxAge) {
    const maxAgeMs = parseRetentionPeriod(retentionConfig.maxAge);
    if (maxAgeMs > 0) {
      cutoffDate = new Date(now.getTime() - maxAgeMs);
    }
  }

  // Sort sessions by lastUpdated (newest first) for count-based retention
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  for (let i = 0; i < sortedSessions.length; i++) {
    const session = sortedSessions[i];
    
    // Never delete the current active session
    if (isActiveSession(session, currentSessionId)) {
      continue;
    }

    let shouldDelete = false;

    // Age-based retention check
    if (cutoffDate && new Date(session.lastUpdated) < cutoffDate) {
      shouldDelete = true;
    }

    // Count-based retention check (keep only N most recent)
    if (retentionConfig.maxCount && i >= retentionConfig.maxCount) {
      shouldDelete = true;
    }

    if (shouldDelete) {
      expiredSessions.push(session);
    }
  }

  return expiredSessions;
}

/**
 * Checks if a session is currently active and should not be deleted
 */
function isActiveSession(session: SessionInfo, currentSessionId: string): boolean {
  return (
    session.id === currentSessionId ||
    session.isCurrentSession ||
    session.id === currentSessionId.slice(0, 8) // Handle shortened IDs
  );
}

/**
 * Safely deletes a session file with proper error handling
 */
async function safeDeleteSession(session: SessionInfo, chatsDir: string, debugMode: boolean): Promise<void> {
  const sessionPath = path.join(chatsDir, session.fileName);

  try {
    // Verify file exists before attempting deletion
    await fs.access(sessionPath, fs.constants.F_OK);
    
    // Attempt to read and validate the session file structure
    // This ensures we're not deleting corrupted or non-session files
    const content = await fs.readFile(sessionPath, 'utf8');
    const sessionData = JSON.parse(content);
    
    // Basic validation that this is actually a session file
    if (!sessionData.sessionId || !sessionData.messages || !Array.isArray(sessionData.messages)) {
      throw new Error('Invalid session file structure');
    }

    // Perform the deletion
    await fs.unlink(sessionPath);
    
    if (debugMode) {
      console.debug(`Deleted expired session: ${session.id} (${session.lastUpdated})`);
    }
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to delete session ${session.id}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parses retention period strings like "30d", "7d", "24h" into milliseconds
 */
function parseRetentionPeriod(period: string): number {
  const match = period.match(/^(\d+)([dhwm])$/);
  if (!match) {
    return 0; // Invalid format
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    'h': 60 * 60 * 1000,           // hours to ms
    'd': 24 * 60 * 60 * 1000,     // days to ms
    'w': 7 * 24 * 60 * 60 * 1000, // weeks to ms
    'm': 30 * 24 * 60 * 60 * 1000 // months (30 days) to ms
  };

  return value * multipliers[unit as keyof typeof multipliers] || 0;
}

/**
 * Validates retention configuration
 */
function validateRetentionConfig(config: SessionRetentionSettings): {
  valid: boolean;
  error?: string;
} {
  if (!config.enabled) {
    return { valid: false, error: 'Retention not enabled' };
  }

  // Validate maxAge if provided
  if (config.maxAge) {
    const maxAgeMs = parseRetentionPeriod(config.maxAge);
    if (maxAgeMs === 0) {
      return { valid: false, error: `Invalid maxAge format: ${config.maxAge}` };
    }
    
    // Enforce minimum retention period (1 day)
    const minRetentionMs = 24 * 60 * 60 * 1000; // 1 day
    if (maxAgeMs < minRetentionMs) {
      return { valid: false, error: 'maxAge cannot be less than 1 day' };
    }
  }

  // Validate maxCount if provided
  if (config.maxCount !== undefined) {
    if (config.maxCount < 1) {
      return { valid: false, error: 'maxCount must be at least 1' };
    }
    if (config.maxCount > 1000) {
      return { valid: false, error: 'maxCount cannot exceed 1000' };
    }
  }

  // At least one retention method must be specified
  if (!config.maxAge && config.maxCount === undefined) {
    return { valid: false, error: 'Either maxAge or maxCount must be specified' };
  }

  return { valid: true };
}