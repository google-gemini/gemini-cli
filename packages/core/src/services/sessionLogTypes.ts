/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Type definitions for the session logging system.
 * Kept in a separate file from the logger itself to allow importing
 * types without pulling in Node.js fs dependencies (useful for workers).
 */

/** A single entry in a daily session log file. */
export interface SessionLogEntry {
  /** ISO 8601 timestamp of when the entry was recorded. */
  readonly timestamp: string;

  /** Unique session identifier. */
  readonly sessionId: string;

  /** The user's prompt text (truncated to 500 chars for storage). */
  readonly prompt: string;

  /** A short summary of what was accomplished in this turn. */
  readonly summary: string;

  /** File paths that were modified during this turn. */
  readonly filesModified: readonly string[];

  /** Duration of the turn in milliseconds. */
  readonly durationMs: number;
}

/** Configuration for the session logger. */
export interface SessionLoggerConfig {
  /** Directory where daily log files are stored. Defaults to ~/.gemini/logs */
  readonly logDir: string;

  /** Number of days to retain logs before rotation. Defaults to 30. */
  readonly retentionDays: number;

  /** Maximum number of entries to buffer before flushing. Defaults to 5. */
  readonly flushThreshold: number;
}

/** Default configuration values. */
export const DEFAULT_SESSION_LOGGER_CONFIG: Readonly<
  Pick<SessionLoggerConfig, 'retentionDays' | 'flushThreshold'>
> = {
  retentionDays: 30,
  flushThreshold: 5,
};

/** Maximum prompt length stored in logs to prevent bloat. */
export const MAX_PROMPT_LENGTH = 500;

/** Pattern for daily log file names: YYYY-MM-DD.jsonl */
export const LOG_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
