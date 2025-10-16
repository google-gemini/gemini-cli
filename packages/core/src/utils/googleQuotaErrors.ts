/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ErrorInfo,
  GoogleApiError,
  QuotaFailure,
  RetryInfo,
} from './googleErrors.js';
import { parseGoogleApiError } from './googleErrors.js';

const FIVE_MINUTES_IN_SECONDS = 5 * 60;

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
 * Parses a duration string (e.g., "34.074824224s", "60s") and returns the time in seconds.
 * @param duration The duration string to parse.
 * @returns The duration in seconds, or null if parsing fails.
 */
function parseDurationInSeconds(duration: string): number | null {
  if (!duration.endsWith('s')) {
    return null;
  }
  const seconds = parseFloat(duration.slice(0, -1));
  return isNaN(seconds) ? null : seconds;
}

/**
 * Analyzes a caught error and classifies it as a specific quota-related error if applicable.
 *
 * It decides whether an error is a `TerminalQuotaError` or a `RetryableQuotaError` based on
 * the following logic:
 * - If the error indicates a daily limit, it's a `TerminalQuotaError`.
 * - If the error suggests a retry delay of more than 5 minutes, it's a `TerminalQuotaError`.
 * - If the error suggests a retry delay of 5 minutes or less, it's a `RetryableQuotaError`.
 * - If the error indicates a per-minute limit, it's a `RetryableQuotaError`.
 *
 * @param error The error to classify.
 * @returns A `TerminalQuotaError`, `RetryableQuotaError`, or the original `unknown` error.
 */
export function classifyGoogleError(error: unknown): unknown {
  const googleApiError = parseGoogleApiError(error);

  if (!googleApiError || googleApiError.code !== 429) {
    return error; // Not a 429 error we can handle.
  }

  const quotaFailure = googleApiError.details.find(
    (d): d is QuotaFailure =>
      d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure',
  );

  const errorInfo = googleApiError.details.find(
    (d): d is ErrorInfo =>
      d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo',
  );

  const retryInfo = googleApiError.details.find(
    (d): d is RetryInfo =>
      d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
  );

  // 1. Check for long-term limits in QuotaFailure or ErrorInfo
  if (quotaFailure) {
    for (const violation of quotaFailure.violations) {
      const quotaId = violation.quotaId ?? '';
      if (quotaId.includes('PerDay') || quotaId.includes('Daily')) {
        return new TerminalQuotaError(
          `Reached a daily quota limit: ${violation.description}`,
          googleApiError,
        );
      }
    }
  }

  if (errorInfo) {
    const quotaLimit = errorInfo.metadata?.['quota_limit'] ?? '';
    if (quotaLimit.includes('PerDay') || quotaLimit.includes('Daily')) {
      return new TerminalQuotaError(
        `Reached a daily quota limit: ${errorInfo.reason}`,
        googleApiError,
      );
    }
  }

  // 2. Check for long delays in RetryInfo
  if (retryInfo?.retryDelay) {
    const delaySeconds = parseDurationInSeconds(retryInfo.retryDelay);
    if (delaySeconds !== null) {
      if (delaySeconds > FIVE_MINUTES_IN_SECONDS) {
        return new TerminalQuotaError(
          `Quota limit requires a long delay of ${retryInfo.retryDelay}.`,
          googleApiError,
        );
      }
      // This is a retryable error with a specific delay.
      return new RetryableQuotaError(
        `Quota limit hit. Retrying after ${retryInfo.retryDelay}.`,
        googleApiError,
        delaySeconds,
      );
    }
  }

  // 3. Check for short-term limits in QuotaFailure or ErrorInfo
  if (quotaFailure) {
    for (const violation of quotaFailure.violations) {
      const quotaId = violation.quotaId ?? '';
      if (quotaId.includes('PerMinute')) {
        return new RetryableQuotaError(
          `Quota limit hit: ${violation.description}. Retrying after 60s.`,
          googleApiError,
          60,
        );
      }
    }
  }

  if (errorInfo) {
    const quotaLimit = errorInfo.metadata?.['quota_limit'] ?? '';
    if (quotaLimit.includes('PerMinute')) {
      return new RetryableQuotaError(
        `Quota limit hit: ${errorInfo.reason}. Retrying after 60s.`,
        googleApiError,
        60,
      );
    }
  }
  return error; // Fallback to original error if no specific classification fits.
}
