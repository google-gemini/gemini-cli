/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelSelectionResult } from '../availability/modelAvailabilityService.js';
import type {
  FailureKind,
  FallbackAction,
  ModelPolicy,
} from '../availability/modelPolicy.js';

/**
 * Defines the intent returned by the UI layer during a fallback scenario.
 */
export type FallbackIntent =
  | 'retry_always' // Retry with fallback model and stick to it for future requests.
  | 'retry_once' // Retry with fallback model for this request only.
  | 'stop' // Switch to fallback for future requests, but stop the current request.
  | 'retry_later' // Stop the current request and do not fallback. Intend to try again later with the same model.
  | 'upgrade'; // Give user an option to upgrade the tier.

export interface FallbackRecommendation extends ModelSelectionResult {
  action: FallbackAction;
  failureKind: FailureKind;
  failedPolicy?: ModelPolicy;
  selectedPolicy: ModelPolicy;
}

/**
 * The interface for the handler provided by the UI layer (e.g., the CLI)
 * to interact with the user during a fallback scenario.
 */
export type FallbackModelHandler = (
  failedModel: string,
  fallbackModel: string,
  error?: unknown,
) => Promise<FallbackIntent | null>;

/**
 * Defines the intent returned by the UI layer during a validation required scenario.
 */
export type ValidationIntent =
  | 'verify' // User chose to verify, wait for completion then retry.
  | 'change_auth' // User chose to change authentication method.
  | 'cancel'; // User cancelled the verification process.

/**
 * The interface for the handler provided by the UI layer (e.g., the CLI)
 * to interact with the user when validation is required.
 */
export type ValidationHandler = (
  validationLink?: string,
  validationDescription?: string,
  learnMoreUrl?: string,
) => Promise<ValidationIntent>;
