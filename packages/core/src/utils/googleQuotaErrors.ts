/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GoogleApiError } from './googleErrors.js';
import { parseGoogleApiError } from './googleErrors.js';

/**
 * Classification result for Google API quota errors
 */
export type QuotaClassification = {
  type: 'TERMINAL_QUOTA' | 'RETRYABLE_QUOTA';
  message: string;
  retryDelayMs?: number;
  cause: GoogleApiError;
};

/**
 * Classifies a Google API error as a quota error if applicable.
 * Returns null if the error is not a quota error or not a 429 error.
 *
 * @param error - The error to classify
 * @returns QuotaClassification if it's a quota error, null otherwise
 */
export function classifyGoogleError(
  error: unknown,
): QuotaClassification | null {
  const googleError = parseGoogleApiError(error);
  if (!googleError || googleError.code !== 429) {
    return null;
  }

  // Check if this is actually a Google quota error by looking for specific indicators
  const message = googleError.message.toLowerCase();
  const hasQuotaIndicator =
    message.includes('quota') ||
    (message.includes('daily') && message.includes('limit')) ||
    message.includes('googleapis.com') ||
    message.includes('gemini');

  // Also check if we have Google-specific error details
  const hasGoogleDetails =
    googleError.details && googleError.details.length > 0;

  // Check for RetryInfo in details
  const retryInfo = googleError.details?.find(
    (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
  );

  // Check for QuotaFailure in details
  const quotaFailure = googleError.details?.find(
    (d) => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure',
  );

  // Check for ErrorInfo in details
  const errorInfo = googleError.details?.find(
    (d) => d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo',
  );

  // Only classify as a quota error if we have clear indicators
  if (!hasQuotaIndicator && !hasGoogleDetails && !quotaFailure && !errorInfo) {
    return null;
  }

  // Determine if this is a terminal or retryable quota error
  const isTerminal = isTerminalQuotaError(googleError, quotaFailure, errorInfo);

  if (isTerminal) {
    return {
      type: 'TERMINAL_QUOTA',
      message: buildQuotaMessage(googleError, quotaFailure, errorInfo),
      cause: googleError,
    };
  }

  // It's retryable - extract retry delay if available
  let retryDelayMs: number | undefined;
  if (retryInfo?.['retryDelay']) {
    retryDelayMs = parseRetryDelay(retryInfo['retryDelay']);
  }

  return {
    type: 'RETRYABLE_QUOTA',
    message: buildQuotaMessage(googleError, quotaFailure, errorInfo),
    retryDelayMs,
    cause: googleError,
  };
}

/**
 * Determines if a quota error is terminal (daily limit) or retryable
 */
function isTerminalQuotaError(
  error: GoogleApiError,
  quotaFailure?: Record<string, unknown>,
  errorInfo?: Record<string, unknown>,
): boolean {
  // Check for daily limit indicators
  const message = error.message.toLowerCase();
  const isDailyLimit =
    message.includes('daily') ||
    message.includes('per day') ||
    message.includes('24 hour') ||
    message.includes('24-hour');

  // Check for Pro model quota indicators
  const isProQuota =
    message.includes('pro') ||
    message.includes('gemini-1.5-pro') ||
    message.includes('gemini-2.0-flash-exp');

  // Check QuotaFailure violations for daily limits
  if (quotaFailure?.violations && Array.isArray(quotaFailure.violations)) {
    for (const violation of quotaFailure.violations as Array<
      Record<string, unknown>
    >) {
      const subject = (violation.subject as string)?.toLowerCase() || '';
      const description =
        (violation.description as string)?.toLowerCase() || '';
      if (
        subject.includes('daily') ||
        description.includes('daily') ||
        subject.includes('per_day') ||
        description.includes('per day')
      ) {
        return true;
      }
    }
  }

  // Check ErrorInfo for quota group indicators
  if (errorInfo?.metadata && typeof errorInfo.metadata === 'object') {
    const metadata = errorInfo.metadata as Record<string, unknown>;
    const quotaGroup = (metadata.quotaGroup as string)?.toLowerCase();
    if (
      quotaGroup &&
      (quotaGroup.includes('daily') || quotaGroup.includes('per_day'))
    ) {
      return true;
    }
  }

  // Daily limits are terminal, Pro quotas are often terminal
  return isDailyLimit || isProQuota;
}

/**
 * Parses retry delay from RetryInfo
 */
function parseRetryDelay(retryDelay: unknown): number | undefined {
  if (!retryDelay) return undefined;

  // Handle string format like "60s"
  if (typeof retryDelay === 'string') {
    const match = retryDelay.match(/^(\d+)s$/);
    if (match) {
      return parseInt(match[1], 10) * 1000;
    }
  }

  // Handle object format { seconds: 60, nanos: 0 }
  if (
    typeof retryDelay === 'object' &&
    retryDelay !== null &&
    'seconds' in retryDelay
  ) {
    const delay = retryDelay as Record<string, unknown>;
    const seconds = parseInt(String(delay.seconds), 10);
    const nanos = Number(delay.nanos) || 0;
    return seconds * 1000 + Math.floor(nanos / 1000000);
  }

  return undefined;
}

/**
 * Builds a descriptive message for the quota error
 */
function buildQuotaMessage(
  error: GoogleApiError,
  quotaFailure?: Record<string, unknown>,
  errorInfo?: Record<string, unknown>,
): string {
  // Start with the base error message
  let message = error.message;

  // Add quota failure details if available
  if (
    quotaFailure?.violations &&
    Array.isArray(quotaFailure.violations) &&
    quotaFailure.violations.length > 0
  ) {
    const violations = (
      quotaFailure.violations as Array<Record<string, unknown>>
    )
      .map((v) => (v.description as string) || (v.subject as string))
      .filter(Boolean)
      .join(', ');
    if (violations) {
      message += ` (Quota violations: ${violations})`;
    }
  }

  // Add error info reason if available
  const reason = errorInfo?.reason as string;
  if (reason && reason !== 'RATE_LIMIT_EXCEEDED') {
    message += ` (Reason: ${reason})`;
  }

  return message;
}
