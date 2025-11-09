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
 * Parses a duration string (e.g., "34.074824224s", "60s", "900ms") and returns the time in seconds.
 * @param duration The duration string to parse.
 * @returns The duration in seconds, or null if parsing fails.
 */
function parseDurationInSeconds(duration: string): number | null {
  if (duration.endsWith('ms')) {
    const milliseconds = parseFloat(duration.slice(0, -2));
    return isNaN(milliseconds) ? null : milliseconds / 1000;
  }
  if (duration.endsWith('s')) {
    const seconds = parseFloat(duration.slice(0, -1));
    return isNaN(seconds) ? null : seconds;
  }
  return null;
}

/**
 * Analyzes a caught error and classifies it as a specific quota-related error if applicable.
 *
 * It decides whether an error is a `TerminalQuotaError` or a `RetryableQuotaError` based on
 * the following logic:
 * - If the error indicates a daily limit, it's a `TerminalQuotaError`.
 * - If the error suggests a retry delay of more than 2 minutes, it's a `TerminalQuotaError`.
 * - If the error suggests a retry delay of 2 minutes or less, it's a `RetryableQuotaError`.
 * - If the error indicates a per-minute limit, it's a `RetryableQuotaError`.
 * - If the error message contains the phrase "Please retry in X[s|ms]", it's a `RetryableQuotaError`.
 *
 * @param error The error to classify.
 * @returns A `TerminalQuotaError`, `RetryableQuotaError`, or the original `unknown` error.
 */
export function classifyGoogleError(error: unknown): unknown {
  const googleApiError = parseGoogleApiError(error);

  if (!googleApiError || googleApiError.code !== 429) {
    // Fallback: try to parse the error message for a retry delay
    const errorMessage = error instanceof Error ? error.message : String(error);
    const match = errorMessage.match(/Please retry in ([0-9.]+(?:ms|s))/);
    if (match?.[1]) {
      const retryDelaySeconds = parseDurationInSeconds(match[1]);
      if (retryDelaySeconds !== null) {
        return new RetryableQuotaError(
          errorMessage,
          googleApiError ?? {
            code: 429,
            message: errorMessage,
            details: [],
          },
          retryDelaySeconds,
        );
      }
    }

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
          `You have exhausted your daily quota on this model.`,
          googleApiError,
        );
      }
    }
  }

  if (errorInfo) {
    // New Cloud Code API quota handling
    if (errorInfo.domain) {
      const validDomains = [
        'cloudcode-pa.googleapis.com',
        'staging-cloudcode-pa.googleapis.com',
        'autopush-cloudcode-pa.googleapis.com',
      ];
      if (validDomains.includes(errorInfo.domain)) {
        if (errorInfo.reason === 'RATE_LIMIT_EXCEEDED') {
          let delaySeconds = 10; // Default retry of 10s
          if (retryInfo?.retryDelay) {
            const parsedDelay = parseDurationInSeconds(retryInfo.retryDelay);
            if (parsedDelay) {
              delaySeconds = parsedDelay;
            }
          }
          return new RetryableQuotaError(
            `${googleApiError.message}`,
            googleApiError,
            delaySeconds,
          );
        }
        if (errorInfo.reason === 'QUOTA_EXHAUSTED') {
          return new TerminalQuotaError(
            `${googleApiError.message}`,
            googleApiError,
          );
        }
      }
    }

    // Existing Cloud Code API quota handling
    const quotaLimit = errorInfo.metadata?.['quota_limit'] ?? '';
    if (quotaLimit.includes('PerDay') || quotaLimit.includes('Daily')) {
      return new TerminalQuotaError(
        `You have exhausted your daily quota on this model.`,
        googleApiError,
      );
    }
  }

  // 2. Check for long delays in RetryInfo
  if (retryInfo?.retryDelay) {
    const delaySeconds = parseDurationInSeconds(retryInfo.retryDelay);
    if (delaySeconds) {
      if (delaySeconds > 120) {
        return new TerminalQuotaError(
          `${googleApiError.message}\nSuggested retry after ${retryInfo.retryDelay}.`,
          googleApiError,
        );
      }
      // This is a retryable error with a specific delay.
      return new RetryableQuotaError(
        `${googleApiError.message}\nSuggested retry after ${retryInfo.retryDelay}.`,
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
          `${googleApiError.message}\nSuggested retry after 60s.`,
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
        `${errorInfo.reason}\nSuggested retry after 60s.`,
        googleApiError,
        60,
      );
    }
  }
  return error; // Fallback to original error if no specific classification fits.
}
