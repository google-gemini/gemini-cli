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
import {
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';
import type { UserTierId } from '../code_assist/types.js';

// actions and stateTransitions are optional when defining ModelPolicy
type PolicyConfig = Omit<ModelPolicy, 'actions' | 'stateTransitions'> & {
  actions?: ModelPolicyActionMap;
  stateTransitions?: ModelPolicyStateMap;
};

export interface ModelPolicyOptions {
  previewEnabled: boolean;
  userTier?: UserTierId;
  useGemini31?: boolean;
  useCustomToolModel?: boolean;
}

const DEFAULT_ACTIONS: ModelPolicyActionMap = {
  terminal: 'prompt',
  transient: 'prompt',
  not_found: 'prompt',
  unknown: 'prompt',
};

const SILENT_ACTIONS: ModelPolicyActionMap = {
  terminal: 'silent',
  transient: 'silent',
  not_found: 'silent',
  unknown: 'silent',
};

const DEFAULT_STATE: ModelPolicyStateMap = {
  terminal: 'terminal',
  transient: 'terminal',
  not_found: 'terminal',
  unknown: 'terminal',
};

/**
 * Returns the Gemini 3 model policy chain.
 * Falls through from smartest pro → flash as last resort.
 */
export function getModelPolicyChain(
  options: ModelPolicyOptions,
): ModelPolicyChain {
  const chain: ModelPolicyChain = [];

  if (options.useGemini31) {
    if (options.useCustomToolModel) {
      chain.push(
        definePolicy({ model: PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL }),
      );
    }
    chain.push(definePolicy({ model: PREVIEW_GEMINI_3_1_MODEL }));
  }

  chain.push(definePolicy({ model: PREVIEW_GEMINI_MODEL }));
  chain.push(
    definePolicy({ model: PREVIEW_GEMINI_FLASH_MODEL, isLastResort: true }),
  );

  return chain;
}

export function createSingleModelChain(model: string): ModelPolicyChain {
  return [definePolicy({ model, isLastResort: true })];
}

/**
 * Flash-lite no longer exists in Gemini 3. Return a Gemini 3 flash chain.
 */
export function getFlashLitePolicyChain(): ModelPolicyChain {
  return [
    definePolicy({
      model: PREVIEW_GEMINI_FLASH_MODEL,
      isLastResort: true,
      actions: SILENT_ACTIONS,
    }),
  ];
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
