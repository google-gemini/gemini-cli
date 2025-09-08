/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines the intent returned by the UI layer during a fallback scenario.
 */
export type FallbackIntent =
  | 'retry' // Immediately retry the current request with the fallback model.
  | 'stop' // Switch to fallback for future requests, but stop the current request.
  | 'auth'; // Stop the current request; user intends to change authentication.

/**
 * The interface for the handler provided by the UI layer (e.g., the CLI)
 * to interact with the user during a fallback scenario.
 */
export type FallbackModelHandler = (
  failedModel: string,
  fallbackModel: string,
  error?: unknown,
) => Promise<FallbackIntent | null>;
