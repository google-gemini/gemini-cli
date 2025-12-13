/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelAvailabilityService,
  ModelHealthStatus,
  ModelId,
} from './modelAvailabilityService.js';

/**
 * Whether to prompt the user or fallback silently on a model API failure.
 */
export type FallbackAction = 'silent' | 'prompt';

/**
 * Type of possible errors from model API failures.
 */
export type FailureKind = 'terminal' | 'transient' | 'not_found' | 'unknown';

/**
 * Map from model API failure reason to user interaction.
 */
export type ModelPolicyActionMap = Partial<Record<FailureKind, FallbackAction>>;

/**
 * What state (e.g. Terminal, Sticky Retry) to set a model after failed API call.
 */
export type ModelPolicyStateMap = Partial<
  Record<FailureKind, ModelHealthStatus>
>;

/**
 * Defines the policy for a single model in the availability chain.
 *
 * This includes:
 * - Which model this policy applies to.
 * - What actions to take (prompt vs silent fallback) for different failure kinds.
 * - How the model's health status should transition upon failure.
 * - Whether this model is considered a "last resort" (i.e. use if all models are unavailable).
 */
export interface ModelPolicy {
  model: ModelId;
  actions: ModelPolicyActionMap;
  stateTransitions: ModelPolicyStateMap;
  isLastResort?: boolean;
}

/**
 * A chain of model policies defining the priority and fallback behavior.
 * The first model in the chain is the primary model.
 */
export type ModelPolicyChain = ModelPolicy[];

/**
 * Context required by retry logic to apply availability policies on failure.
 */
export interface RetryAvailabilityContext {
  service: ModelAvailabilityService;
  policy: ModelPolicy;
}
