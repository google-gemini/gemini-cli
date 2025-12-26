/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as util from 'node:util';

/**
 * Checks if debug mode is enabled via environment variables.
 * This matches the logic in packages/cli/src/config/config.ts:isDebugMode()
 */
function isDebugModeEnabled(): boolean {
  return [process.env['DEBUG'], process.env['DEBUG_MODE']].some(
    (v) => v === 'true' || v === '1',
  );
}

/**
 * A simple, centralized logger for developer-facing debug messages.
 *
 * WHY USE THIS?
 * - It makes the INTENT of the log clear (it's for developers, not users).
 * - It provides a single point of control for debug logging behavior.
 * - We can lint against direct `console.*` usage to enforce this pattern.
 *
 * HOW IT WORKS:
 * Debug messages (log, warn, debug) are only output to console when debug mode
 * is enabled via DEBUG=1 or DEBUG_MODE=1 environment variables. Error messages
 * are always output. All messages are written to the debug log file if configured.
 */
class DebugLogger {
  private logStream: fs.WriteStream | undefined;

  constructor() {
    this.logStream = process.env['GEMINI_DEBUG_LOG_FILE']
      ? fs.createWriteStream(process.env['GEMINI_DEBUG_LOG_FILE'], {
          flags: 'a',
        })
      : undefined;
    // Handle potential errors with the stream
    this.logStream?.on('error', (err) => {
      // Log to console as a fallback, but don't crash the app
      console.error('Error writing to debug log stream:', err);
    });
  }

  private writeToFile(level: string, args: unknown[]) {
    if (this.logStream) {
      const message = util.format(...args);
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}\n`;
      this.logStream.write(logEntry);
    }
  }

  log(...args: unknown[]): void {
    this.writeToFile('LOG', args);
    if (isDebugModeEnabled()) {
      console.log(...args);
    }
  }

  warn(...args: unknown[]): void {
    this.writeToFile('WARN', args);
    if (isDebugModeEnabled()) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    this.writeToFile('ERROR', args);
    // Errors are always output to console
    console.error(...args);
  }

  debug(...args: unknown[]): void {
    this.writeToFile('DEBUG', args);
    if (isDebugModeEnabled()) {
      console.debug(...args);
    }
  }
}

export const debugLogger = new DebugLogger();
