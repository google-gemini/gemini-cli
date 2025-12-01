/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type {
  FailureKind,
  FallbackAction,
  ModelPolicy,
  ModelPolicyChain,
} from './modelPolicy.js';
import { createDefaultPolicy, getModelPolicyChain } from './policyCatalog.js';
import { getEffectiveModel } from '../config/models.js';

/**
 * Resolves the active policy chain for the given config, ensuring the
 * user-selected active model is represented.
 */
export function resolvePolicyChain(config: Config): ModelPolicyChain {
  const chain = getModelPolicyChain({
    previewEnabled: !!config.getPreviewFeatures(),
    userTier: config.getUserTier(),
  });
  // TODO: This will be replaced when we get rid of Fallback Modes
  const activeModel = getEffectiveModel(
    config.isInFallbackMode(),
    config.getModel(),
    config.getPreviewFeatures(),
  );

  if (chain.some((policy) => policy.model === activeModel)) {
    return chain;
  }

  // If the user specified a model not in the default chain, we assume they want
  // *only* that model. We do not fallback to the default chain.
  return [createDefaultPolicy(activeModel, { isLastResort: true })];
}

/**
 * Produces the failed policy (if it exists in the chain) and the list of
 * fallback candidates that follow it.
 */
export function buildFallbackPolicyContext(
  chain: ModelPolicyChain,
  failedModel: string,
): {
  failedPolicy?: ModelPolicy;
  candidates: ModelPolicy[];
} {
  const index = chain.findIndex((policy) => policy.model === failedModel);
  if (index === -1) {
    return { failedPolicy: undefined, candidates: chain };
  }
  // Return [candidates_after, candidates_before] to prioritize downgrades
  // (continuing the chain) before wrapping around to upgrades.
  return {
    failedPolicy: chain[index],
    candidates: [...chain.slice(index + 1), ...chain.slice(0, index)],
  };
}

export function resolvePolicyAction(
  failureKind: FailureKind,
  policy: ModelPolicy,
): FallbackAction {
  return policy.actions?.[failureKind] ?? 'prompt';
}
