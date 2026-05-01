/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiError, type GenerateContentResponse } from '@google/genai';
import {
  TerminalQuotaError,
  RetryableQuotaError,
  ValidationRequiredError,
  classifyGoogleError,
} from './googleQuotaErrors.js';
import { delay, createAbortError } from './delay.js';
import { debugLogger } from './debugLogger.js';
import { getErrorStatus, ModelNotFoundError } from './httpErrors.js';
import type { RetryAvailabilityContext } from '../availability/modelPolicy.js';

export type { RetryAvailabilityContext };
export const DEFAULT_MAX_ATTEMPTS = 10;

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetryOnError: (error: Error, retryFetchErrors?: boolean) => boolean;
  shouldRetryOnContent?: (content: GenerateContentResponse) => boolean;
  onPersistent429?: (
    authType?: string,
    error?: unknown,
  ) => Promise<string | boolean | null>;
  onValidationRequired?: (
    error: ValidationRequiredError,
  ) => Promise<'verify' | 'change_auth' | 'cancel'>;
  authType?: string;
  retryFetchErrors?: boolean;
  signal?: AbortSignal;
  getAvailabilityContext?: () => RetryAvailabilityContext | undefined;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  initialDelayMs: 5000,
  maxDelayMs: 30000, // 30 seconds
  shouldRetryOnError: isRetryableError,
};

const RETRYABLE_NETWORK_CODES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'EPROTO', // Generic protocol error (often SSL-related)
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
];

// Node.js builds SSL error codes by prepending ERR_SSL_ to the uppercased
// OpenSSL reason string with spaces replaced by underscores (see
// TLSWrap::ClearOut in node/src/crypto/crypto_tls.cc). The reason string
// format varies by OpenSSL version (e.g. ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC
// on OpenSSL 1.x, ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC on OpenSSL 3.x), so
// match the stable suffix instead of enumerating every variant.
const RETRYABLE_SSL_ERROR_PATTERN = /^ERR_SSL_.*BAD_RECORD_MAC/i;

/**
 * Returns true if the error code should be retried: either an exact match
 * against RETRYABLE_NETWORK_CODES, or an SSL BAD_RECORD_MAC variant (the
 * OpenSSL reason-string portion of the code varies across OpenSSL versions).
 */
function isRetryableSslErrorCode(code: string): boolean {
  return (
    RETRYABLE_NETWORK_CODES.includes(code) ||
    RETRYABLE_SSL_ERROR_PATTERN.test(code)
  );
}

function getNetworkErrorCode(error: unknown): string | undefined {
  const getCode = (obj: unknown): string | undefined => {
    if (typeof obj !== 'object' || obj === null) {
      return undefined;
    }
    if ('code' in obj && typeof (obj as { code: unknown }).code === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (obj as { code: string }).code;
    }
    return undefined;
  };

  const directCode = getCode(error);
  if (directCode) {
    return directCode;
  }

  // Traverse the cause chain to find error codes (SSL errors are often nested)
  let current: unknown = error;
  const maxDepth = 5; // Prevent infinite loops in case of circular references
  for (let depth = 0; depth < maxDepth; depth++) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !('cause' in current)
    ) {
      break;
    }
    current = (current as { cause: unknown }).cause;
    const code = getCode(current);
    if (code) {
      return code;
    }
  }

  return undefined;
}

export const FETCH_FAILED_MESSAGE = 'fetch failed';
export const INCOMPLETE_JSON_MESSAGE = 'incomplete json segment';

/**
 * Categorizes an error for retry telemetry purposes.
 * Returns a safe string without PII.
 */
export function getRetryErrorType(error: unknown): string {
  if (error === 'Invalid content') {
    return 'INVALID_CONTENT';
  }

  const errorCode = getNetworkErrorCode(error);
  if (errorCode && isRetryableSslErrorCode(errorCode)) {
    return errorCode;
  }

  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes(FETCH_FAILED_MESSAGE)) {
      return 'FETCH_FAILED';
    }
    if (lowerMessage.includes(INCOMPLETE_JSON_MESSAGE)) {
      return 'INCOMPLETE_JSON';
    }
  }

  const status = getErrorStatus(error);
  if (status !== undefined) {
    if (status === 429) return 'QUOTA_EXCEEDED';
    if (status >= 500 && status < 600) return 'SERVER_ERROR';
    return `HTTP_${status}`;
  }

  if (error instanceof Error) {
    return error.name;
  }

  return 'UNKNOWN';
}

/**
 * Default predicate function to determine if a retry should be attempted.
 * Retries on 429 (Too Many Requests) and 5xx server errors.
 * @param error The error object.
 * @param retryFetchErrors Whether to retry on specific fetch errors.
 * @returns True if the error is a transient error, false otherwise.
 */
export function isRetryableError(
  error: Error | unknown,
  retryFetchErrors?: boolean,
): boolean {
  // Check for common network error codes
  const errorCode = getNetworkErrorCode(error);
  if (errorCode && isRetryableSslErrorCode(errorCode)) {
    return true;
  }

  if (retryFetchErrors && error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    // Check for generic fetch failed message or incomplete JSON segment (common stream error)
    if (
      lowerMessage.includes(FETCH_FAILED_MESSAGE) ||
      lowerMessage.includes(INCOMPLETE_JSON_MESSAGE)
    ) {
      return true;
    }
  }

  // Priority check for ApiError
  if (error instanceof ApiError) {
    // Explicitly do not retry 400 (Bad Request)
    if (error.status === 400) return false;
    return (
      error.status === 429 ||
      error.status === 499 ||
      (error.status >= 500 && error.status < 600)
    );
  }

  // Check for status using helper (handles other error shapes)
  const status = getErrorStatus(error);
  if (status !== undefined) {
    return status === 429 || status === 499 || (status >= 500 && status < 600);
  }

  return false;
}

/**
 * Retries a function with exponential backoff and jitter.
 * @param fn The asynchronous function to retry.
 * @param options Optional retry configuration.
 * @returns A promise that resolves with the result of the function if successful.
 * @throws The last error encountered if all attempts fail.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  if (options?.signal?.aborted) {
    throw createAbortError();
  }

  if (options?.maxAttempts !== undefined && options.maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive number.');
  }

  const cleanOptions = options
    ? Object.fromEntries(Object.entries(options).filter(([_, v]) => v != null))
    : {};

  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    onPersistent429,
    onValidationRequired,
    authType,
    shouldRetryOnError,
    shouldRetryOnContent,
    retryFetchErrors,
    signal,
    getAvailabilityContext,
    onRetry,
  } = {
    ...DEFAULT_RETRY_OPTIONS,
    shouldRetryOnError: isRetryableError,
    ...cleanOptions,
  };

  const getCurrentMaxAttempts = () =>
    getAvailabilityContext?.()?.policy.maxAttempts ?? maxAttempts;

  let attempt = 0;
  let currentDelay = initialDelayMs;
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw createAbortError();
    }
  };

  while (attempt < getCurrentMaxAttempts()) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    attempt++;
    try {
      const result = await fn();

      if (
        shouldRetryOnContent &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        shouldRetryOnContent(result as GenerateContentResponse)
      ) {
        throwIfAborted();
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, currentDelay + jitter);
        if (onRetry) {
          onRetry(attempt, new Error('Invalid content'), delayWithJitter);
        }
        await delay(delayWithJitter, signal);
        currentDelay = Math.min(maxDelayMs, currentDelay * 2);
        continue;
      }

      const successContext = getAvailabilityContext?.();
      if (successContext) {
        successContext.service.markHealthy(successContext.policy.model);
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throwIfAborted();

      const classifiedError = classifyGoogleError(error);

      const errorCode = getErrorStatus(error);

      if (
        classifiedError instanceof TerminalQuotaError ||
        classifiedError instanceof ModelNotFoundError
      ) {
        if (onPersistent429) {
          try {
            const fallbackModel = await onPersistent429(
              authType,
              classifiedError,
            );
            if (fallbackModel) {
              attempt = 0; // Reset attempts and retry with the new model.
              currentDelay = initialDelayMs;
              continue;
            }
          } catch (fallbackError) {
            debugLogger.warn('Fallback to Flash model failed:', fallbackError);
          }
        }
        // Terminal/not_found already recorded; nothing else to mark here.
        throw classifiedError; // Throw if no fallback or fallback failed.
      }

      // Handle ValidationRequiredError - user needs to verify before proceeding
      if (classifiedError instanceof ValidationRequiredError) {
        if (onValidationRequired) {
          try {
            const intent = await onValidationRequired(classifiedError);
            if (intent === 'verify') {
              // User verified, retry the request
              attempt = 0;
              currentDelay = initialDelayMs;
              continue;
            }
            // 'change_auth' or 'cancel' - mark as handled and throw
            classifiedError.userHandled = true;
          } catch (validationError) {
            debugLogger.warn('Validation handler failed:', validationError);
          }
        }
        throw classifiedError;
      }

      const is500 =
        errorCode !== undefined && errorCode >= 500 && errorCode < 600;

      if (classifiedError instanceof RetryableQuotaError || is500) {
        if (attempt >= getCurrentMaxAttempts()) {
          const errorMessage =
            classifiedError instanceof Error ? classifiedError.message : '';
          debugLogger.warn(
            `Attempt ${attempt} failed${errorMessage ? `: ${errorMessage}` : ''}. Max attempts reached`,
          );
          if (onPersistent429) {
            try {
              const fallbackModel = await onPersistent429(
                authType,
                classifiedError,
              );
              if (fallbackModel) {
                attempt = 0; // Reset attempts and retry with the new model.
                currentDelay = initialDelayMs;
                continue;
              }
            } catch (fallbackError) {
              debugLogger.warn('Model fallback failed:', fallbackError);
            }
          }
          throw classifiedError instanceof RetryableQuotaError
            ? classifiedError
            : error;
        }

        if (
          classifiedError instanceof RetryableQuotaError &&
          classifiedError.retryDelayMs !== undefined
        ) {
          currentDelay = Math.max(currentDelay, classifiedError.retryDelayMs);
          // Positive jitter up to +20% while respecting server minimum delay
          const jitter = currentDelay * 0.2 * Math.random();
          const delayWithJitter = currentDelay + jitter;
          debugLogger.warn(
            `Attempt ${attempt} failed: ${classifiedError.message}. Retrying after ${Math.round(delayWithJitter)}ms...`,
          );
          if (onRetry) {
            onRetry(attempt, error, delayWithJitter);
          }
          await delay(delayWithJitter, signal);
          currentDelay = Math.min(maxDelayMs, currentDelay * 2);
          continue;
        } else {
          const errorStatus = getErrorStatus(error);
          logRetryAttempt(attempt, error, errorStatus);

          // Exponential backoff with jitter for non-quota errors
          const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
          const delayWithJitter = Math.max(0, currentDelay + jitter);
          if (onRetry) {
            onRetry(attempt, error, delayWithJitter);
          }
          await delay(delayWithJitter, signal);
          currentDelay = Math.min(maxDelayMs, currentDelay * 2);
          continue;
        }
      }

      // Generic retry logic for other errors
      if (
        attempt >= getCurrentMaxAttempts() ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        !shouldRetryOnError(error as Error, retryFetchErrors)
      ) {
        throw error;
      }

      const errorStatus = getErrorStatus(error);
      logRetryAttempt(attempt, error, errorStatus);

      // Exponential backoff with jitter for non-quota errors
      const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
      const delayWithJitter = Math.max(0, currentDelay + jitter);
      if (onRetry) {
        onRetry(attempt, error, delayWithJitter);
      }
      await delay(delayWithJitter, signal);
      currentDelay = Math.min(maxDelayMs, currentDelay * 2);
    }
  }

  throw new Error('Retry attempts exhausted');
}

/**
 * Logs a message for a retry attempt when using exponential backoff.
 * @param attempt The current attempt number.
 * @param error The error that caused the retry.
 * @param errorStatus The HTTP status code of the error, if available.
 */
function logRetryAttempt(
  attempt: number,
  error: unknown,
  errorStatus?: number,
): void {
  let message = `Attempt ${attempt} failed. Retrying with backoff...`;
  if (errorStatus) {
    message = `Attempt ${attempt} failed with status ${errorStatus}. Retrying with backoff...`;
  }

  if (errorStatus === 429) {
    debugLogger.warn(message, error);
  } else if (errorStatus && errorStatus >= 500 && errorStatus < 600) {
    debugLogger.warn(message, error);
  } else if (error instanceof Error) {
    // Fallback for errors that might not have a status but have a message
    if (error.message.includes('429')) {
      debugLogger.warn(
        `Attempt ${attempt} failed with 429 error (no Retry-After header). Retrying with backoff...`,
        error,
      );
    } else if (error.message.match(/5\d{2}/)) {
      debugLogger.warn(
        `Attempt ${attempt} failed with 5xx error. Retrying with backoff...`,
        error,
      );
    } else {
      debugLogger.warn(message, error); // Default to warn for other errors
    }
  } else {
    debugLogger.warn(message, error); // Default to warn if error type is unknown
  }
}
