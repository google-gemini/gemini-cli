/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Handle for an abort signal that additionally fires after a timeout.
 */
export interface TimeoutAbortHandle {
  /**
   * The signal to pass to the underlying operation. It aborts when the
   * external signal aborts or when the timeout elapses, whichever comes
   * first.
   */
  signal: AbortSignal;

  /**
   * Returns whether the timeout (and not the external signal) caused the
   * abort.
   */
  didTimeout: () => boolean;

  /**
   * Stops the timeout timer and detaches listeners. Must be called once the
   * operation settles, including on success.
   */
  dispose: () => void;
}

/**
 * Creates an abort signal that aborts when the external signal aborts or
 * when `timeoutMs` elapses, whichever comes first.
 *
 * Operations whose underlying request can hang forever (for example an LLM
 * call that never settles) can use this to guarantee they eventually return,
 * while keeping external cancellation (such as the user pressing Esc)
 * distinguishable from a timeout via `didTimeout()`.
 *
 * The caller must call `dispose()` once the operation settles so the timer
 * does not keep the process alive.
 */
export function createTimeoutAbortHandle(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): TimeoutAbortHandle {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    onExternalAbort();
  } else {
    externalSignal?.addEventListener('abort', onExternalAbort, {
      once: true,
    });
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}
