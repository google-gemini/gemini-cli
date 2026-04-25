/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

/**
 * Machine-readable error codes for perf-companion operations.
 *
 * Each code maps to a specific failure mode, allowing callers to branch on
 * `error.code` rather than parsing message strings.
 */
export enum PerfErrorCode {
  PARSE_FAILED = 'PARSE_FAILED',
  SNAPSHOT_TOO_LARGE = 'SNAPSHOT_TOO_LARGE',
  INSPECTOR_CONNECT_FAILED = 'INSPECTOR_CONNECT_FAILED',
  CAPTURE_TIMEOUT = 'CAPTURE_TIMEOUT',
  INVALID_SNAPSHOT_FORMAT = 'INVALID_SNAPSHOT_FORMAT',
  MEMORY_PRESSURE = 'MEMORY_PRESSURE',
  PROFILER_NOT_AVAILABLE = 'PROFILER_NOT_AVAILABLE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_PARAMS = 'INVALID_PARAMS',
}

/**
 * Structured error with a machine-readable code and recoverability signal.
 *
 * The `recoverable` flag tells the LLM bridge whether to suggest a retry
 * (e.g. CAPTURE_TIMEOUT) or surface the error directly (e.g. INVALID_PARAMS).
 */
export class PerfCompanionError extends Error {
  override readonly name = 'PerfCompanionError';

  constructor(
    message: string,
    readonly code: PerfErrorCode,
    readonly recoverable: boolean = true,
  ) {
    super(message);
    // Maintains proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
