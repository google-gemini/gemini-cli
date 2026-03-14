/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standardized logger interface for the Gemini CLI SDK.
 *
 * All modules should use this interface for consistent logging behavior.
 * The logger is injectable to allow different implementations
 * (console, telemetry, file, no-op for testing).
 */
export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Log severity levels, ordered from most verbose to least verbose.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Default logger implementation that writes to the console.
 * Supports configurable log levels to filter output.
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  private log(
    level: LogLevel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logFn: (...data: any[]) => void,
    prefix: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (this.level <= level) {
      const logMessage = `[${prefix}] ${message}`;
      if (metadata) {
         
        logFn(logMessage, metadata);
      } else {
         
        logFn(logMessage);
      }
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    this.log(LogLevel.DEBUG, console.debug, 'DEBUG', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    this.log(LogLevel.INFO, console.info, 'INFO', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    this.log(LogLevel.WARN, console.warn, 'WARN', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    this.log(LogLevel.ERROR, console.error, 'ERROR', message, metadata);
  }
}

/**
 * A no-op logger that silently discards all log messages.
 * Useful for unit testing or when logging should be completely disabled.
 */
export class NoopLogger implements Logger {
  debug(_message: string, _metadata?: Record<string, unknown>): void {}
  info(_message: string, _metadata?: Record<string, unknown>): void {}
  warn(_message: string, _metadata?: Record<string, unknown>): void {}
  error(_message: string, _metadata?: Record<string, unknown>): void {}
}
