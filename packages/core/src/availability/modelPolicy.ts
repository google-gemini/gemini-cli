/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelHealthStatus, ModelId } from './modelAvailabilityService.js';

export type FallbackAction = 'silent' | 'prompt';

export type FailureKind = 'terminal' | 'transient' | 'not_found' | 'unknown';

export type ModelPolicyActionMap = Partial<Record<FailureKind, FallbackAction>>;

export type ModelPolicyStateMap = Partial<
  Record<FailureKind, ModelHealthStatus>
>;

export interface ModelPolicy {
  model: ModelId;
  actions: ModelPolicyActionMap;
  stateTransitions: ModelPolicyStateMap;
  isLastResort?: boolean;
}

export type ModelPolicyChain = ModelPolicy[];
