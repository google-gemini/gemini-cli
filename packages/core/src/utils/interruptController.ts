/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A reusable controller for cancelling ongoing Gemini response generation.
 *
 * Wraps AbortController with interrupt-and-reset semantics: calling
 * {@link interrupt} aborts the current signal and immediately provisions
 * a fresh one, so the next operation can start without manual re-creation.
 *
 * Primary motivation is experimental voice mode, where a user may speak
 * a new instruction while the model is still generating a response.
 * The controller is intentionally generic so any interactive CLI feature
 * (keyboard input, future voice pipeline, etc.) can reuse it.
 *
 * @example
 * ```ts
 * const controller = new InterruptController();
 *
 * // Pass the signal to a generation call
 * await gemini.generate(prompt, { signal: controller.signal });
 *
 * // When new input arrives, cancel and restart
 * controller.interrupt();
 * await gemini.generate(newPrompt, { signal: controller.signal });
 * ```
 */
export class InterruptController {
  private controller: AbortController;

  constructor() {
    this.controller = new AbortController();
  }

  /** The current {@link AbortSignal}. Pass this to cancellable operations. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Whether the current signal has already been aborted. */
  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  /**
   * Abort the current operation and provision a new signal.
   *
   * After this call, {@link signal} returns a fresh, non-aborted signal
   * that can be handed to the next generation request.
   *
   * @param reason - Optional abort reason forwarded to the signal.
   */
  interrupt(reason?: string): void {
    this.controller.abort(reason ?? 'Interrupted by new input');
    this.controller = new AbortController();
  }

  /**
   * Reset without aborting. Useful when the previous operation completed
   * normally and a clean signal is needed for the next cycle.
   */
  reset(): void {
    if (this.controller.signal.aborted) {
      this.controller = new AbortController();
    }
  }
}
