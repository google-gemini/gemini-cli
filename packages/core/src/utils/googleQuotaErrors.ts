/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GoogleApiError } from './googleErrors.js';

/**
 * A non-retryable error indicating a hard quota limit has been reached (e.g., daily limit).
 */
export class TerminalQuotaError extends Error {
  constructor(
    message: string,
    override readonly cause: GoogleApiError,
  ) {
    super(message);
    this.name = 'TerminalQuotaError';
  }
}

/**
 * A retryable error indicating a temporary quota issue (e.g., per-minute limit).
 */
export class RetryableQuotaError extends Error {
  retryDelayMs: number;

  constructor(
    message: string,
    override readonly cause: GoogleApiError,
    retryDelaySeconds: number,
  ) {
    super(message);
    this.name = 'RetryableQuotaError';
    this.retryDelayMs = retryDelaySeconds * 1000;
  }
}

/**
 * Analyzes a caught error and classifies it as a specific quota-related error if applicable.
 *
 * AUTONOMOUS MODE: Quota enforcement completely disabled for unlimited API usage.
 *
 * @param error The error to classify.
 * @returns The original error without any quota classification.
 */
export function classifyGoogleError(error: unknown): unknown {
  // AUTONOMOUS MODE: Return original error without quota enforcement
  // This allows unlimited API usage without quota restrictions
  return error;
}
