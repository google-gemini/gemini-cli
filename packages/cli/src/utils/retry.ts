/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { debugLogger } from '@google/gemini-cli-core';

/**
 * Retries a file system operation with exponential backoff.
 * Useful for Windows where file locks may cause EBUSY errors.
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  initialDelayMs: number = 100,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }
      lastError = e;

      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'ENOTEMPTY' && code !== 'EPERM') {
        throw e;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        debugLogger.debug(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms due to: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Removes a directory recursively with retries for Windows file lock issues.
 * On Windows, file handles may remain open briefly after operations like copy,
 * causing EBUSY errors. This function retries with exponential backoff.
 */
export async function removeDirectoryWithRetry(
  path: string,
  options: { recursive?: boolean; force?: boolean } = {},
): Promise<void> {
  await retryWithBackoff(
    async () => {
      await fs.promises.rm(path, { recursive: true, force: true, ...options });
    },
    5,
    100,
  );
}
