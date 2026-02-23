/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type SimpleLoggerFunction = (...args: unknown[]) => void;

export interface SimpleLogger {
  debug: SimpleLoggerFunction;
  warn: SimpleLoggerFunction;
  error: SimpleLoggerFunction;
}

export interface LoggerBackend {
  debug: SimpleLoggerFunction;
  warn: SimpleLoggerFunction;
  error: SimpleLoggerFunction;
}

export function createSimpleLogger(
  prefix: string,
  backend: LoggerBackend,
): SimpleLogger {
  return {
    debug: (...args: unknown[]) =>
      backend.debug(`[DEBUG] [${prefix}]`, ...args),
    warn: (...args: unknown[]) => backend.warn(`[WARN] [${prefix}]`, ...args),
    error: (...args: unknown[]) =>
      backend.error(`[ERROR] [${prefix}]`, ...args),
  };
}
