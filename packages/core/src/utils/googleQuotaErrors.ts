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

  if (!googleApiError) {
    const legacyFallback = extractLegacyResourceExhaustedError(error);
    return legacyFallback
      ? new TerminalQuotaError(legacyFallback.message, legacyFallback)
      : error;
  }

  if (googleApiError.code !== 429) {
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

function extractLegacyResourceExhaustedError(
  error: unknown,
): GoogleApiError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const statusCode =
    typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined;

  const payload = extractErrorPayload(
    (error as { response?: unknown }).response,
  );

  const errorMessage =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : undefined;

  const matchesResourceExhausted = (message?: string): boolean =>
    typeof message === 'string' &&
    message.toLowerCase().includes('resource exhausted');

  if (!payload) {
    if (statusCode === 429 && matchesResourceExhausted(errorMessage)) {
      return {
        code: statusCode,
        message: errorMessage!,
        details: [],
      };
    }
    return null;
  }

  const payloadStatusRaw =
    typeof payload['status'] === 'string' ? payload['status'] : undefined;
  const payloadStatus = payloadStatusRaw ? payloadStatusRaw.toUpperCase() : '';

  const payloadMessage =
    typeof payload['message'] === 'string' ? payload['message'] : undefined;
  const payloadCode =
    typeof payload['code'] === 'number'
      ? (payload['code'] as number)
      : (statusCode ?? 429);
  const reasons = extractReasons(payload['errors']);

  if (payloadCode !== 429) {
    return null;
  }

  const isResourceExhausted =
    payloadStatus === 'RESOURCE_EXHAUSTED' ||
    matchesResourceExhausted(payloadMessage) ||
    reasons.some((reason) =>
      ['ratelimitexceeded', 'quotaexceeded', 'resourceexhausted'].includes(
        reason,
      ),
    );

  if (!isResourceExhausted) {
    return null;
  }

  return {
    code: payloadCode,
    message: payloadMessage ?? errorMessage ?? 'Resource exhausted.',
    details: [],
  };
}

function extractErrorPayload(
  response: unknown,
): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  let data = (response as { data?: unknown }).data;
  if (!data) {
    return null;
  }

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  if (
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'object'
  ) {
    const nested = (data as { error: unknown }).error;
    if (nested && typeof nested === 'object') {
      return nested as Record<string, unknown>;
    }
  }

  return data as Record<string, unknown>;
}

function extractReasons(errors: unknown): string[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors
    .map((entry) => {
      if (entry && typeof entry === 'object' && 'reason' in entry) {
        const reason = (entry as { reason?: unknown }).reason;
        if (typeof reason === 'string') {
          return reason.toLowerCase();
        }
      }
      return undefined;
    })
    .filter((reason): reason is string => typeof reason === 'string');
}
