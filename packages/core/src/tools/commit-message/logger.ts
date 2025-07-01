/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Logger {
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  debug(message: string, meta?: Record<string, any>): void;
}

export class CommitLogger implements Logger {
  private readonly enableDebug: boolean;

  constructor(enableDebug: boolean = false) {
    this.enableDebug = enableDebug;
  }

  info(message: string, meta?: Record<string, any>): void {
    const logEntry = this.formatMessage('INFO', message, meta);
    console.log(logEntry);
  }

  warn(message: string, meta?: Record<string, any>): void {
    const logEntry = this.formatMessage('WARN', message, meta);
    console.warn(logEntry);
  }

  error(message: string, meta?: Record<string, any>): void {
    const logEntry = this.formatMessage('ERROR', message, meta);
    console.error(logEntry);
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.enableDebug) {
      const logEntry = this.formatMessage('DEBUG', message, meta);
      console.log(logEntry);
    }
  }

  private formatMessage(level: string, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }
}