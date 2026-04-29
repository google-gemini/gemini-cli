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
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  resolveModel,
} from '../config/models.js';
import type { UserTierId } from '../code_assist/types.js';

// actions and stateTransitions are optional when defining ModelPolicy
type PolicyConfig = Omit<ModelPolicy, 'actions' | 'stateTransitions'> & {
  actions?: ModelPolicyActionMap;
  stateTransitions?: ModelPolicyStateMap;
};

export interface ModelPolicyOptions {
  previewEnabled: boolean;
  isAutoSelection?: boolean;
  userTier?: UserTierId;
  useGemini31?: boolean;
  useGemini31FlashLite?: boolean;
  useCustomToolModel?: boolean;
}

const DEFAULT_ACTIONS: ModelPolicyActionMap = {
  terminal: 'prompt',
  transient: 'prompt',
  not_found: 'prompt',
  unknown: 'prompt',
};

export const SILENT_ACTIONS: ModelPolicyActionMap = {
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

const AUTO_ROUTING_OVERRIDES = {
  maxAttempts: 3,
  actions: { ...DEFAULT_ACTIONS, transient: 'silent' } as ModelPolicyActionMap,
  stateTransitions: {
    ...DEFAULT_STATE,
    transient: 'sticky_retry',
  } as ModelPolicyStateMap,
};

const FLASH_LITE_CHAIN: ModelPolicyChain = [
  definePolicy({
    model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
    actions: SILENT_ACTIONS,
  }),
  definePolicy({
    model: DEFAULT_GEMINI_FLASH_MODEL,
    actions: SILENT_ACTIONS,
  }),
  definePolicy({
    model: DEFAULT_GEMINI_MODEL,
    isLastResort: true,
    actions: SILENT_ACTIONS,
  }),
];

/**
 * Returns the default ordered model policy chain for the user.
 */
export function getModelPolicyChain(
  options: ModelPolicyOptions,
): ModelPolicyChain {
  const isAuto = options.isAutoSelection ?? false;

  if (options.previewEnabled) {
    const proModel = resolveModel(
      PREVIEW_GEMINI_MODEL,
      options.useGemini31,
      options.useGemini31FlashLite,
      options.useCustomToolModel,
    );
    return [
      definePolicy({
        model: proModel,
        ...(isAuto
          ? {
              maxAttempts: 3,
              actions: { ...DEFAULT_ACTIONS, transient: 'silent' },
              stateTransitions: { ...DEFAULT_STATE, transient: 'sticky_retry' },
            }
          : {}),
      }),
      definePolicy({
        model: PREVIEW_GEMINI_FLASH_MODEL,
        isLastResort: true,
        maxAttempts: 10,
      }),
    ];
  }

  return [
    definePolicy({
      model: DEFAULT_GEMINI_MODEL,
      ...(isAuto ? AUTO_ROUTING_OVERRIDES : {}),
    }),
    definePolicy({
      model: DEFAULT_GEMINI_FLASH_MODEL,
      isLastResort: true,
      maxAttempts: 10,
    }),
  ];
}

export function createSingleModelChain(model: string): ModelPolicyChain {
  return [definePolicy({ model, isLastResort: true })];
}

export function getFlashLitePolicyChain(): ModelPolicyChain {
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
    maxAttempts: config.maxAttempts,
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
