/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { debugLogger } from '@google/gemini-cli-core';

const RETRYABLE_DIRECTORY_REMOVAL_ERRORS = new Set([
  'EBUSY',
  'ENOTEMPTY',
  'EPERM',
]);
const MAX_DIRECTORY_REMOVAL_ATTEMPTS = 5;
const INITIAL_DIRECTORY_REMOVAL_DELAY_MS = 100;

function isRetryableDirectoryRemovalError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    RETRYABLE_DIRECTORY_REMOVAL_ERRORS.has(
      (error as NodeJS.ErrnoException).code ?? '',
    )
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function removeDirectoryWithRetry(path: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.promises.rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        !isRetryableDirectoryRemovalError(error) ||
        attempt >= MAX_DIRECTORY_REMOVAL_ATTEMPTS
      ) {
        throw error;
      }

      const delayMs = INITIAL_DIRECTORY_REMOVAL_DELAY_MS * 2 ** (attempt - 1);
      debugLogger.debug(
        `Retrying directory removal for ${path} after ${delayMs}ms due to ${error.code}: ${error.message}`,
      );
      await wait(delayMs);
    }
  }
}
