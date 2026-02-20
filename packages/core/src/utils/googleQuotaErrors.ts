/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ErrorInfo,
  GoogleApiError,
  Help,
  QuotaFailure,
  RetryInfo,
} from './googleErrors.js';
import { parseGoogleApiError } from './googleErrors.js';
import { getErrorStatus, ModelNotFoundError } from './httpErrors.js';

/**
 * A non-retryable error indicating a hard quota limit has been reached (e.g., daily limit).
 */
export class TerminalQuotaError extends Error {
  retryDelayMs?: number;

  constructor(
    message: string,
    override readonly cause: GoogleApiError,
    retryDelaySeconds?: number,
  ) {
    super(message);
    this.name = 'TerminalQuotaError';
    this.retryDelayMs = retryDelaySeconds
      ? retryDelaySeconds * 1000
      : undefined;
  }
}

/**
 * A retryable error indicating a temporary quota issue (e.g., per-minute limit).
 */
export class RetryableQuotaError extends Error {
  retryDelayMs?: number;

  constructor(
    message: string,
    override readonly cause: GoogleApiError,
    retryDelaySeconds?: number,
  ) {
    super(message);
    this.name = 'RetryableQuotaError';
    this.retryDelayMs = retryDelaySeconds
      ? retryDelaySeconds * 1000
      : undefined;
  }
}

/**
 * An error indicating that user validation is required to continue.
 */
export class ValidationRequiredError extends Error {
  validationLink?: string;
  validationDescription?: string;
  learnMoreUrl?: string;
  userHandled: boolean = false;

  constructor(
    message: string,
    override readonly cause?: GoogleApiError,
    validationLink?: string,
    validationDescription?: string,
    learnMoreUrl?: string,
  ) {
    super(message);
    this.name = 'ValidationRequiredError';
    this.validationLink = validationLink;
    this.validationDescription = validationDescription;
    this.learnMoreUrl = learnMoreUrl;
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
 * Valid Cloud Code API domains for VALIDATION_REQUIRED errors.
 */
const CLOUDCODE_DOMAINS = [
  'cloudcode-pa.googleapis.com',
  'staging-cloudcode-pa.googleapis.com',
  'autopush-cloudcode-pa.googleapis.com',
];

/**
 * Checks if a 403 error requires user validation and extracts validation details.
 *
 * @param googleApiError The parsed Google API error to check.
 * @returns A `ValidationRequiredError` if validation is required, otherwise `null`.
 */
function classifyValidationRequiredError(
  googleApiError: GoogleApiError,
): ValidationRequiredError | null {
  const errorInfo = googleApiError.details.find(
    (d): d is ErrorInfo =>
      d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo',
  );

  if (!errorInfo) {
    return null;
  }

  if (
    !CLOUDCODE_DOMAINS.includes(errorInfo.domain) ||
    errorInfo.reason !== 'VALIDATION_REQUIRED'
  ) {
    return null;
  }

  // Try to extract validation info from Help detail first
  const helpDetail = googleApiError.details.find(
    (d): d is Help => d['@type'] === 'type.googleapis.com/google.rpc.Help',
  );

  let validationLink: string | undefined;
  let validationDescription: string | undefined;
  let learnMoreUrl: string | undefined;

  if (helpDetail?.links && helpDetail.links.length > 0) {
    // First link is the validation link, extract description and URL
    const validationLinkInfo = helpDetail.links[0];
    validationLink = validationLinkInfo.url;
    validationDescription = validationLinkInfo.description;

    // Look for "Learn more" link - identified by description or support.google.com hostname
    const learnMoreLink = helpDetail.links.find((link) => {
      if (link.description.toLowerCase().trim() === 'learn more') return true;
      const parsed = URL.parse(link.url);
      return parsed?.hostname === 'support.google.com';
    });
    if (learnMoreLink) {
      learnMoreUrl = learnMoreLink.url;
    }
  }

  // Fallback to ErrorInfo metadata if Help detail not found
  if (!validationLink) {
    validationLink = errorInfo.metadata?.['validation_link'];
  }

  return new ValidationRequiredError(
    googleApiError.message,
    googleApiError,
    validationLink,
    validationDescription,
    learnMoreUrl,
  );
}
/**
 * Analyzes a caught error and classifies it as a specific error type if applicable.
 *
 * Classification logic:
 * - 404 errors are classified as `ModelNotFoundError`.
 * - 403 errors with `VALIDATION_REQUIRED` from cloudcode-pa domains are classified
 *   as `ValidationRequiredError`.
 * - 429 errors are classified as either `TerminalQuotaError` or `RetryableQuotaError`:
 *   - CloudCode API: `RATE_LIMIT_EXCEEDED` → `RetryableQuotaError`, `QUOTA_EXHAUSTED` → `TerminalQuotaError`.
 *   - If the error indicates a daily limit (in QuotaFailure), it's a `TerminalQuotaError`.
 *   - If the error has a retry delay, it's a `RetryableQuotaError`.
 *   - If the error indicates a per-minute limit, it's a `RetryableQuotaError`.
 *   - If the error message contains the phrase "Please retry in X[s|ms]", it's a `RetryableQuotaError`.
 *
 * @param error The error to classify.
 * @returns A classified error or the original `unknown` error.
 */
export function classifyGoogleError(error: unknown): unknown {
  const googleApiError = parseGoogleApiError(error);
  const status = googleApiError?.code ?? getErrorStatus(error);

  if (status === 404) {
    const message =
      googleApiError?.message ||
      (error instanceof Error ? error.message : 'Model not found');
    return new ModelNotFoundError(message, status);
  }

  // Check for 403 VALIDATION_REQUIRED errors from Cloud Code API
  if (status === 403 && googleApiError) {
    const validationError = classifyValidationRequiredError(googleApiError);
    if (validationError) {
      return validationError;
    }
  }

  // Check for 503 Service Unavailable errors
  if (status === 503) {
    const errorMessage =
      googleApiError?.message ||
      (error instanceof Error ? error.message : String(error));
    return new RetryableQuotaError(
      errorMessage,
      googleApiError ?? {
        code: 503,
        message: errorMessage,
        details: [],
      },
    );
  }

  if (
    !googleApiError ||
    googleApiError.code !== 429 ||
    googleApiError.details.length === 0
  ) {
    // Fallback: try to parse the error message for a retry delay
    const errorMessage =
      googleApiError?.message ||
      (error instanceof Error ? error.message : String(error));
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
    } else if (status === 429) {
      // Fallback: If it is a 429 but doesn't have a specific "retry in" message,
      // assume it is a temporary rate limit and retry after 5 sec (same as DEFAULT_RETRY_OPTIONS).
      return new RetryableQuotaError(
        errorMessage,
        googleApiError ?? {
          code: 429,
          message: errorMessage,
          details: [],
        },
      );
    }

    return error; // Not a 429 error we can handle with structured details or a parsable retry message.
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
  let delaySeconds;

  if (retryInfo?.retryDelay) {
    const parsedDelay = parseDurationInSeconds(retryInfo.retryDelay);
    if (parsedDelay) {
      delaySeconds = parsedDelay;
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
          return new RetryableQuotaError(
            `${googleApiError.message}`,
            googleApiError,
            delaySeconds ?? 10,
          );
        }
        if (errorInfo.reason === 'QUOTA_EXHAUSTED') {
          return new TerminalQuotaError(
            `${googleApiError.message}`,
            googleApiError,
            delaySeconds,
          );
        }
      }
    }
  }

  // 2. Check for delays in RetryInfo
  if (retryInfo?.retryDelay && delaySeconds) {
    return new RetryableQuotaError(
      `${googleApiError.message}\nSuggested retry after ${retryInfo.retryDelay}.`,
      googleApiError,
      delaySeconds,
    );
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

  // If we reached this point and the status is still 429, we return retryable.
  if (status === 429) {
    const errorMessage =
      googleApiError?.message ||
      (error instanceof Error ? error.message : String(error));
    return new RetryableQuotaError(
      errorMessage,
      googleApiError ?? {
        code: 429,
        message: errorMessage,
        details: [],
      },
    );
  }
  return error; // Fallback to original error if no specific classification fits.
}
