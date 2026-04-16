/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';

/**
 * Internal contract implemented by the memory backend that {@link MemoryService}
 * delegates to. This interface is intentionally *not* exported from the
 * package's public surface (`src/index.ts`) and is *not* surfaced via
 * `GeminiCLIExtension` — it exists purely as a typing seam between
 * `MemoryService` and its concrete implementation so that the two can evolve
 * independently and be substituted in tests.
 */
export interface MemoryProvider {
  /** Stable identifier used in diagnostic logs. */
  readonly id: string;

  /**
   * Invoked once per session, when the owning `GeminiClient` initializes the
   * memory subsystem. Implementations may kick off background work but must
   * return synchronously.
   */
  onSessionStart(config: Config, sessionId: string): void;

  /**
   * Returns static instructions to inject into the LLM's system prompt.
   * Called once per session and again after `onTurnComplete`.
   */
  getSystemInstructions(): string;

  /**
   * Returns dynamic, recalled context for the current turn based on the
   * user's query. Called once per non-internal turn.
   */
  getTurnContext(query: string): string;

  /**
   * Invoked after the LLM completes a turn. Must return synchronously; any
   * persistence work should be fired fire-and-forget by the implementation.
   */
  onTurnComplete(userMessage: string, assistantMessage: string): void;

  /**
   * Invoked when the owning session is shutting down gracefully.
   */
  onSessionEnd(): void;
}
