/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../core/contentGenerator.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: Error) => boolean;
  onPersistent429?: (authType?: string) => Promise<string | null>;
  authType?: string;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  initialDelayMs: 5000,
  maxDelayMs: 30000, // 30 seconds
  shouldRetry: defaultShouldRetry,
};

/**
 * Default predicate function to determine if a retry should be attempted.
 * Retries on 429 (Too Many Requests) and 5xx server errors.
 * @param error The error object.
 * @returns True if the error is a transient error, false otherwise.
 */
function defaultShouldRetry(error: Error | unknown): boolean {
  // Check for common transient error status codes either in message or a status property
  if (error && typeof (error as { status?: number }).status === 'number') {
    const status = (error as { status: number }).status;
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }
  }
  if (error instanceof Error && error.message) {
    if (error.message.includes('429')) return true;
    if (error.message.match(/5\d{2}/)) return true;
  }
  return false;
}

/**
 * Delays execution for a specified number of milliseconds.
 * @param ms The number of milliseconds to delay.
 * @returns A promise that resolves after the delay.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    onPersistent429,
    authType,
    shouldRetry,
  } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let attempt = 0;
  let currentDelay = initialDelayMs;
  let consecutive429Count = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (error) {
      const errorStatus = getErrorStatus(error);

      // Track consecutive 429 errors
      if (errorStatus === 429) {
        consecutive429Count++;
      } else {
        consecutive429Count = 0;
      }

      // If we have persistent 429s and a fallback callback for OAuth
      if (
        consecutive429Count >= 2 &&
        onPersistent429 &&
        authType === AuthType.LOGIN_WITH_GOOGLE
      ) {
        try {
          const fallbackModel = await onPersistent429(authType);
          if (fallbackModel) {
            // Reset attempt counter and try with new model
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // With the model updated, we continue to the next attempt
            continue;
          }
        } catch (fallbackError) {
          // If fallback fails, continue with original error
          console.warn('Fallback to Flash model failed:', fallbackError);
        }
      }

      // Check if we've exhausted retries or shouldn't retry
      if (attempt >= maxAttempts || !shouldRetry(error as Error)) {
        throw error;
      }

      const { delayDurationMs, errorStatus: delayErrorStatus } =
        getDelayDurationAndStatus(error);

      if (delayDurationMs > 0) {
        // Respect Retry-After header if present and parsed
        console.warn(
          `Attempt ${attempt} failed with status ${delayErrorStatus ?? 'unknown'}. Retrying after explicit delay of ${delayDurationMs}ms...`,
          error,
        );
        await delay(delayDurationMs);
        // Reset currentDelay for next potential non-429 error, or if Retry-After is not present next time
        currentDelay = initialDelayMs;
      } else {
        // Fallback to exponential backoff with jitter
        logRetryAttempt(attempt, error, errorStatus);
        // Add jitter: +/- 30% of currentDelay
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, currentDelay + jitter);
        await delay(delayWithJitter);
        currentDelay = Math.min(maxDelayMs, currentDelay * 2);
      }
    }
  }
  // This line should theoretically be unreachable due to the throw in the catch block.
  // Added for type safety and to satisfy the compiler that a promise is always returned.
  throw new Error('Retry attempts exhausted');
}

/**
 * Extracts the HTTP status code from an error object.
 * @param error The error object.
 * @returns The HTTP status code, or undefined if not found.
 */
function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }
    // Check for error.response.status (common in axios errors)
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (
        error as { response: { status?: unknown; headers?: unknown } }
      ).response;
      if ('status' in response && typeof response.status === 'number') {
        return response.status;
      }
    }
  }
  return undefined;
}

/**
 * Extracts the Retry-After delay from an error object's headers.
 * @param error The error object.
 * @returns The delay in milliseconds, or 0 if not found or invalid.
 */
function getRetryAfterDelayMs(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    // Check for error.response.headers (common in axios errors)
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (error as { response: { headers?: unknown } }).response;
      if (
        'headers' in response &&
        typeof response.headers === 'object' &&
        response.headers !== null
      ) {
        const headers = response.headers as { 'retry-after'?: unknown };
        const retryAfterHeader = headers['retry-after'];
        if (typeof retryAfterHeader === 'string') {
          const retryAfterSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(retryAfterSeconds)) {
            return retryAfterSeconds * 1000;
          }
          // It might be an HTTP date
          const retryAfterDate = new Date(retryAfterHeader);
          if (!isNaN(retryAfterDate.getTime())) {
            return Math.max(0, retryAfterDate.getTime() - Date.now());
          }
        }
      }
    }
  }
  return 0;
}

/**
 * Determines the delay duration based on the error, prioritizing Retry-After header.
 * @param error The error object.
 * @returns An object containing the delay duration in milliseconds and the error status.
 */
function getDelayDurationAndStatus(error: unknown): {
  delayDurationMs: number;
  errorStatus: number | undefined;
} {
  const errorStatus = getErrorStatus(error);
  let delayDurationMs = 0;

  if (errorStatus === 429) {
    delayDurationMs = getRetryAfterDelayMs(error);
  }
  return { delayDurationMs, errorStatus };
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
    console.warn(message, error);
  } else if (errorStatus && errorStatus >= 500 && errorStatus < 600) {
    console.error(message, error);
  } else if (error instanceof Error) {
    // Fallback for errors that might not have a status but have a message
    if (error.message.includes('429')) {
      console.warn(
        `Attempt ${attempt} failed with 429 error (no Retry-After header). Retrying with backoff...`,
        error,
      );
    } else if (error.message.match(/5\d{2}/)) {
      console.error(
        `Attempt ${attempt} failed with 5xx error. Retrying with backoff...`,
        error,
      );
    } else {
      console.warn(message, error); // Default to warn for other errors
    }
  } else {
    console.warn(message, error); // Default to warn if error type is unknown
  }
}
