/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelPolicy,
  ModelPolicyActionMap,
  ModelPolicyChain,
  ModelPolicyStateMap,
} from './modelPolicy.js';
import type { Config } from '../config/config.js';
import { DEFAULT_ACTIONS, DEFAULT_STATE } from './modelPolicy.js';
import type { UserTierId } from '../code_assist/types.js';
import {
  FLASH_LITE_CHAIN,
  PREVIEW_CHAIN,
  DEFAULT_CHAIN,
} from './defaultModelChains.js';

// actions and stateTransitions are optional when defining ModelPolicy
type PolicyConfig = Omit<ModelPolicy, 'actions' | 'stateTransitions'> & {
  actions?: ModelPolicyActionMap;
  stateTransitions?: ModelPolicyStateMap;
};

export interface ModelPolicyOptions {
  previewEnabled: boolean;
  userTier?: UserTierId;
}

/**
 * Returns the default ordered model policy chain for the user.
 */
export function getModelPolicyChain(
  options: ModelPolicyOptions,
  config: Config,
): ModelPolicyChain | undefined {
  if (config.getEnableModelConfigurability?.()) {
    const chainKey = options.previewEnabled ? 'preview' : 'default';
    const chains = config.getModelChains?.();
    const requestedChain = chains?.[chainKey];
    if (requestedChain) {
      return cloneChain(requestedChain);
    }
    return undefined;
  }

  if (options.previewEnabled) {
    return cloneChain(PREVIEW_CHAIN);
  }
  return cloneChain(DEFAULT_CHAIN);
}

export function createSingleModelChain(model: string): ModelPolicyChain {
  return [definePolicy({ model, isLastResort: true })];
}

export function getFlashLitePolicyChain(
  config?: Config,
): ModelPolicyChain | undefined {
  if (config?.getEnableModelConfigurability?.()) {
    const requestedChain = config.getModelChains?.()['flash-lite'];
    if (requestedChain) {
      return cloneChain(requestedChain);
    }
    return undefined;
  }

  return cloneChain(FLASH_LITE_CHAIN);
}

/**
 * Provides a default policy scaffold for models not present in the catalog.
 */
export function createDefaultPolicy(
  model: string,
  options?: { isLastResort?: boolean },
): ModelPolicy {
  return definePolicy({ model, isLastResort: options?.isLastResort });
}

export function validateModelPolicyChain(chain: ModelPolicyChain): void {
  if (chain.length === 0) {
    throw new Error('Model policy chain must include at least one model.');
  }
  const lastResortCount = chain.filter((policy) => policy.isLastResort).length;
  if (lastResortCount === 0) {
    throw new Error('Model policy chain must include an `isLastResort` model.');
  }
  if (lastResortCount > 1) {
    throw new Error('Model policy chain must only have one `isLastResort`.');
  }
}

/**
 * Helper to define a ModelPolicy with default actions and state transitions.
 * Ensures every policy is a fresh instance to avoid shared state.
 */
function definePolicy(config: PolicyConfig): ModelPolicy {
  return {
    model: config.model,
    isLastResort: config.isLastResort,
    actions: { ...DEFAULT_ACTIONS, ...(config.actions ?? {}) },
    stateTransitions: {
      ...DEFAULT_STATE,
      ...(config.stateTransitions ?? {}),
    },
  };
}

function clonePolicy(policy: ModelPolicy): ModelPolicy {
  return {
    ...policy,
    actions: { ...policy.actions },
    stateTransitions: { ...policy.stateTransitions },
  };
}

function cloneChain(chain: ModelPolicyChain): ModelPolicyChain {
  return chain.map(clonePolicy);
}
