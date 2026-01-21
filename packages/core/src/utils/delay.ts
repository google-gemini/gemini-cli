/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Factory to create a standard abort error for delay helpers.
 */
export function createAbortError(): Error {
  const abortError = new Error('Aborted');
  abortError.name = 'AbortError';
  return abortError;
}

/**
 * Returns a promise that resolves after the provided duration unless aborted.
 *
 * @param ms Delay duration in milliseconds.
 * @param signal Optional abort signal to cancel the wait early.
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  // If no abort signal is provided, set simple delay
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Immediately reject if signal has already been aborted
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  // remove abort and timeout listeners to prevent memory-leaks
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
