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

  return [createDefaultPolicy(activeModel), ...chain];
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
  return {
    failedPolicy: chain[index],
    candidates: chain.slice(index + 1),
  };
}

export function resolvePolicyAction(
  failureKind: FailureKind,
  policy: ModelPolicy,
): FallbackAction {
  return policy.actions?.[failureKind] ?? 'prompt';
}
