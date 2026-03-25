/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RetryableQuotaError,
  TerminalQuotaError,
  ValidationRequiredError,
} from './errors.js';
import { debugLogger } from './debugLogger.js';

export interface RetryOptions<T> {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetryOnContent?: (result: T) => boolean;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  signal?: AbortSignal;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);

    if (signal?.aborted) {
      clearTimeout(id);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }

    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function logRetryAttempt(attempt: number, error: Error, status?: number): void {
  debugLogger.debug(
    `[Retry] Attempt ${attempt} failed`,
    status !== undefined ? `(status: ${status})` : '',
    error.message,
  );
}

function computeDelayWithJitter(currentDelay: number): number {
  const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
  return Math.max(0, currentDelay + jitter);
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions<T> = {},
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelayMs = 500,
    maxDelayMs = 10_000,
    shouldRetryOnContent,
    onRetry,
    signal,
  } = options;

  let currentDelay = initialDelayMs;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      if (shouldRetryOnContent?.(result)) {
        const contentError = new Error('Invalid content, retrying');
        lastError = contentError;

        if (attempt < maxRetries) {
          const delayMs = computeDelayWithJitter(currentDelay);
          onRetry?.(attempt, contentError, delayMs);
          await delay(delayMs, signal);
          currentDelay = Math.min(maxDelayMs, currentDelay * 2);
          continue;
        }

        break;
      }

      return result;
    } catch (error: unknown) {
      const safeError =
        error instanceof Error ? error : new Error(String(error));
      lastError = safeError;

      if (
        safeError instanceof TerminalQuotaError ||
        safeError instanceof ValidationRequiredError
      ) {
        throw safeError;
      }

      const isRetryable = safeError instanceof RetryableQuotaError;

      if (!isRetryable && attempt >= maxRetries) {
        break;
      }

      const errorStatus = getErrorStatus(safeError);
      logRetryAttempt(attempt, safeError, errorStatus);

      const delayMs = computeDelayWithJitter(currentDelay);
      onRetry?.(attempt, safeError, delayMs);
      await delay(delayMs, signal);
      currentDelay = Math.min(maxDelayMs, currentDelay * 2);
    }
  }

  throw lastError ?? new Error('Retry attempts exhausted');
}
