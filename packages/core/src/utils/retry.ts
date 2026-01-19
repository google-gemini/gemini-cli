/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';
import { ApiError } from '@google/genai';
import {
  TerminalQuotaError,
  RetryableQuotaError,
  classifyGoogleError,
} from './googleQuotaErrors.js';
import { delay, createAbortError } from './delay.js';
import { debugLogger } from './debugLogger.js';
import { getErrorStatus, ModelNotFoundError } from './httpErrors.js';
import type { RetryAvailabilityContext } from '../availability/modelPolicy.js';

export type { RetryAvailabilityContext };

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
  authType?: string;
  retryFetchErrors?: boolean;
  signal?: AbortSignal;
  getAvailabilityContext?: () => RetryAvailabilityContext | undefined;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 10,
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
];

function getNetworkErrorCode(error: unknown): string | undefined {
  const getCode = (obj: unknown): string | undefined => {
    if (typeof obj !== 'object' || obj === null) {
      return undefined;
    }
    if ('code' in obj && typeof (obj as { code: unknown }).code === 'string') {
      return (obj as { code: string }).code;
    }
    return undefined;
  };

  const directCode = getCode(error);
  if (directCode) {
    return directCode;
  }

  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return getCode((error as { cause: unknown }).cause);
  }

  return undefined;
}

const FETCH_FAILED_MESSAGE = 'fetch failed';

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
  if (errorCode && RETRYABLE_NETWORK_CODES.includes(errorCode)) {
    return true;
  }

  if (retryFetchErrors && error instanceof Error) {
    // Check for generic fetch failed message (case-insensitive)
    if (error.message.toLowerCase().includes(FETCH_FAILED_MESSAGE)) {
      return true;
    }
  }

  // Priority check for ApiError
  if (error instanceof ApiError) {
    // Explicitly do not retry 400 (Bad Request)
    if (error.status === 400) return false;
    return error.status === 429 || (error.status >= 500 && error.status < 600);
  }

  // Check for status using helper (handles other error shapes)
  const status = getErrorStatus(error);
  if (status !== undefined) {
    return status === 429 || (status >= 500 && status < 600);
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

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxAttempts) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    attempt++;
    try {
      const result = await fn();

      if (
        shouldRetryOnContent &&
        shouldRetryOnContent(result as GenerateContentResponse)
      ) {
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

      const is500 =
        errorCode !== undefined && errorCode >= 500 && errorCode < 600;

      if (classifiedError instanceof RetryableQuotaError || is500) {
        if (attempt >= maxAttempts) {
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
          debugLogger.warn(
            `Attempt ${attempt} failed: ${classifiedError.message}. Retrying after ${classifiedError.retryDelayMs}ms...`,
          );
          if (onRetry) {
            onRetry(attempt, error, classifiedError.retryDelayMs);
          }
          await delay(classifiedError.retryDelayMs, signal);
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
        attempt >= maxAttempts ||
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
