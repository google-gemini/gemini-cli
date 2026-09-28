/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { debugLogger, isNodeError } from '@google/gemini-cli-core';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Retries an asynchronous operation with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelay = 100,
    shouldRetry = () => true,
  } = options;

  if (maxRetries <= 0) {
    throw new Error('maxRetries must be a positive number.');
  }

  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }
      debugLogger.debug(
        `Operation failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})... Error: ${error}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error('Unreachable');
}

/**
 * Removes a directory or file with retries for common Windows locking errors.
 */
export async function removeDirectoryWithRetry(
  path: string,
  options: fs.RmOptions = { recursive: true, force: true },
  retryOptions?: RetryOptions,
): Promise<void> {
  const isRetryableError = (error: unknown): boolean => {
    if (isNodeError(error)) {
      return (
        error.code === 'EBUSY' ||
        error.code === 'ENOTEMPTY' ||
        error.code === 'EPERM'
      );
    }
    return false;
  };

  await retryWithBackoff(
    () => fs.promises.rm(path, { recursive: true, force: true, ...options }),
    {
      maxRetries: 5,
      initialDelay: 100,
      shouldRetry: isRetryableError,
      ...retryOptions,
    },
  );
}
