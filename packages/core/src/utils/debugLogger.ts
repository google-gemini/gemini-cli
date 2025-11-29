/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as util from 'node:util';

/**
 * A simple, centralized logger for developer-facing debug messages.
 *
 * WHY USE THIS?
 * - It makes the INTENT of the log clear (it's for developers, not users).
 * - It provides a single point of control for debug logging behavior.
 * - We can lint against direct `console.*` usage to enforce this pattern.
 *
 * HOW IT WORKS:
 * This is a thin wrapper around the native `console` object. The `ConsolePatcher`
 * will intercept these calls and route them to the debug drawer UI.
 */
class DebugLogger {
  private logFile: string | undefined;

  constructor() {
    this.logFile = process.env['GEMINI_DEBUG_LOG_FILE'];
  }

  private writeToFile(level: string, args: unknown[]) {
    if (this.logFile) {
      const message = util.format(...args);
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}\n`;
      try {
        fs.appendFileSync(this.logFile, logEntry);
      } catch (_e) {
        // Ignore errors writing to log file to prevent crashing the app
      }
    }
  }

  log(...args: unknown[]): void {
    this.writeToFile('LOG', args);
    console.log(...args);
  }

  warn(...args: unknown[]): void {
    this.writeToFile('WARN', args);
    console.warn(...args);
  }

  error(...args: unknown[]): void {
    this.writeToFile('ERROR', args);
    console.error(...args);
  }

  debug(...args: unknown[]): void {
    this.writeToFile('DEBUG', args);
    console.debug(...args);
  }
}

export const debugLogger = new DebugLogger();
