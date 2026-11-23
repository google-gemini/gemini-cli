/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAbortError } from './delay.js';

/**
 * Waits for `promise`, but stops waiting as soon as `signal` aborts.
 *
 * Passing an AbortSignal to an operation only asks it to stop. If a step
 * inside the operation does not listen to the signal, the caller keeps
 * waiting. This helper returns control to the caller when the signal aborts:
 * the returned promise rejects with an AbortError, and the outcome of the
 * original promise is ignored.
 *
 * @param promise The operation to wait for.
 * @param signal The signal that ends the wait.
 */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    promise
      .finally(() => signal.removeEventListener('abort', onAbort))
      .then(resolve, reject);
  });
}
