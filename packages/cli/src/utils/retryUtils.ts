/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Retry options for network operations
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to log retry attempts (default: true) */
  logRetries?: boolean;
  /** Function to determine if error is retryable (default: retries on network errors) */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Default function to determine if an error is retryable
 */
function defaultIsRetryable(error: unknown): boolean {
  if (!error) return false;

  // Retry on network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('etimedout')
    );
  }

  // Retry on HTTP 5xx errors
  if (typeof error === 'object' && error !== null) {
    if ('status' in error) {
      const status = (error as { status: number }).status;
      return status >= 500 && status < 600;
    }
    if ('statusCode' in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      return statusCode >= 500 && statusCode < 600;
    }
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn The async function to retry
 * @param options Retry options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    logRetries = true,
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Log retry attempt
      if (logRetries) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.warn(
          `Attempt ${attempt + 1}/${maxRetries + 1} failed: ${errorMessage}. Retrying in ${delay}ms...`,
        );
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}
