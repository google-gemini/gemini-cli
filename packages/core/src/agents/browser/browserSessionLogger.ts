/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Session-scoped JSONL logger for browser agent debugging.
 *
 * Writes structured log entries to
 *   {storage.getProjectTempLogsDir()}/browser-session-{sessionId}.jsonl
 *
 * Each line is a self-contained JSON object with a timestamp, event type,
 * and arbitrary data payload. The logger never throws — write failures are
 * swallowed and forwarded to debugLogger so they don't crash the agent.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogger } from '../../utils/debugLogger.js';

export interface BrowserLogEntry {
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN =
  /^(value|text|password|secret|token|key|credential|auth)$/i;

const REDACTED = '[REDACTED]';

/**
 * Returns a shallow copy of `data` with values redacted for keys that match
 * common sensitive-field names. Nested `args` objects are redacted recursively.
 */
export function redactSensitiveFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERN.test(key) && typeof value === 'string') {
      result[key] = REDACTED;
    } else if (
      key === 'args' &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = redactSensitiveFields(
        Object.fromEntries(Object.entries(value)),
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class BrowserSessionLogger {
  private readonly filePath: string;
  private closed = false;

  constructor(logsDir: string, sessionId: string) {
    fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
    this.filePath = path.join(logsDir, `browser-session-${sessionId}.jsonl`);
  }

  getFilePath(): string {
    return this.filePath;
  }

  logEvent(type: string, data: Record<string, unknown>): void {
    if (this.closed) return;

    const entry: BrowserLogEntry = {
      timestamp: new Date().toISOString(),
      type,
      data,
    };

    try {
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', {
        mode: 0o600,
      });
    } catch (err) {
      debugLogger.warn(
        `Browser session log write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  close(): void {
    this.closed = true;
  }
}
