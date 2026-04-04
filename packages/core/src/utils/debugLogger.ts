/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as util from 'node:util';

export type DebugLoggerLevel = 'log' | 'warn' | 'error' | 'debug';
export type DebugLoggerCaptureHook = (
  level: DebugLoggerLevel,
  args: unknown[],
) => void;

const DEBUG_LOGGER_CAPTURE_HOOK = Symbol.for('gemini.debugLogger.captureHook');

function getCaptureHook(): DebugLoggerCaptureHook | undefined {
  return (
    globalThis as typeof globalThis & {
      [DEBUG_LOGGER_CAPTURE_HOOK]?: DebugLoggerCaptureHook;
    }
  )[DEBUG_LOGGER_CAPTURE_HOOK];
}

export function setDebugLoggerCaptureHook(hook?: DebugLoggerCaptureHook): void {
  const scopedGlobal = globalThis as typeof globalThis & {
    [DEBUG_LOGGER_CAPTURE_HOOK]?: DebugLoggerCaptureHook;
  };

  if (hook) {
    scopedGlobal[DEBUG_LOGGER_CAPTURE_HOOK] = hook;
    return;
  }

  delete scopedGlobal[DEBUG_LOGGER_CAPTURE_HOOK];
}

function shouldSuppressConsoleOutput(): boolean {
  return process.env['GEMINI_SUPPRESS_DEBUG_LOGGER_CONSOLE'] === 'true';
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
 * This is a thin wrapper around the native `console` object. The `ConsolePatcher`
 * will intercept these calls and route them to the debug drawer UI.
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
    const captureHook = getCaptureHook();
    captureHook?.('log', args);
    if (captureHook || shouldSuppressConsoleOutput()) {
      return;
    }
    console.log(...args);
  }

  warn(...args: unknown[]): void {
    this.writeToFile('WARN', args);
    const captureHook = getCaptureHook();
    captureHook?.('warn', args);
    if (captureHook || shouldSuppressConsoleOutput()) {
      return;
    }
    console.warn(...args);
  }

  error(...args: unknown[]): void {
    this.writeToFile('ERROR', args);
    const captureHook = getCaptureHook();
    captureHook?.('error', args);
    if (captureHook || shouldSuppressConsoleOutput()) {
      return;
    }
    console.error(...args);
  }

  debug(...args: unknown[]): void {
    this.writeToFile('DEBUG', args);
    const captureHook = getCaptureHook();
    captureHook?.('debug', args);
    if (captureHook || shouldSuppressConsoleOutput()) {
      return;
    }
    console.debug(...args);
  }
}

export const debugLogger = new DebugLogger();
